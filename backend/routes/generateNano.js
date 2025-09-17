import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import {
  uploadImageToSupabase,
  getTodayImageCount,
  getLatestImageToday,
} from "../controllers/supabase.js";

/* ---------- Paths ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.join(__dirname, "..");
const IMAGES_DIR = path.join(BACKEND_DIR, "images");
const PROMPTS_PATH = path.join(BACKEND_DIR, "prompts.json");

/* ---------- Config ---------- */
const MODEL = "gemini-2.5-flash-image-preview";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Keep this as your oil-painting instruction for run #1
const FIRST_RUN_PROMPT =
  "Render this photograph as a realistic oil portrait in a golden frame like a painting in an art museum exhibit. Preserve the subject's exact likeness and the original composition of the photo.";

const UNPRODUCTIVE_THRESHOLD_INCREMENT = 30; // Generate image every 30 minutes of unproductive time

/* ---------- Utils ---------- */

// Get midnight of current day
function getTodayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Get count of images generated today from Supabase
async function getTodayImageCountLocal() {
  return await getTodayImageCount();
}

async function fetchRescueTimeData(startTime, endTime) {
  if (!process.env.RESCUETIME_API_KEY) {
    throw new Error("RESCUETIME_API_KEY missing in backend/.env");
  }

  // Set restrict_begin/end to full days to ensure we capture all possible data
  // Then filter the response array by the actual startTime and endTime
  const startDate = new Date(startTime.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const endDate = endTime.toISOString().split("T")[0];

  const params = {
    key: process.env.RESCUETIME_API_KEY,
    perspective: "interval",
    resolution_time: "minute",
    restrict_begin: startDate,
    restrict_end: endDate,
    restrict_kind: "activity",
    format: "json",
  };

  try {
    const response = await axios.get("https://www.rescuetime.com/anapi/data", { params });
    const allRows = response.data.rows || [];

    // Filter data to only include the specified time range
    const filteredRows = allRows.filter((row) => {
      // Row structure: [Date, Time Spent (seconds), Number of People, Activity, Category, Productivity]
      // The first element is the timestamp in format "2024-01-01 14:05:00"
      const timestamp = new Date(row[0]);
      return timestamp >= startTime && timestamp <= endTime;
    });

    return filteredRows;
  } catch (error) {
    console.error("❌ RescueTime API Error:", error.response?.data || error.message);
    return []; // Return empty array on error to prevent crashing
  }
}

// prunes the full data to just the unproductive minutes
// potentially rework / remove if we want more rich data in the future
function calculateUnproductiveMinutes(rows) {
  const unproductiveSeconds = rows
    .filter((row) => row[5] < 0) // row[5] is the productivity score
    .reduce((total, row) => total + (row[1] || 0), 0); // row[1] is time in seconds

  return unproductiveSeconds / 60;
}

function loadPromptsFlat() {
  if (!fs.existsSync(PROMPTS_PATH)) {
    throw new Error(`prompts.json not found at ${PROMPTS_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(PROMPTS_PATH, "utf-8"));
  const flat = Array.isArray(raw) ? raw : Object.values(raw).flat();
  if (!flat.length) throw new Error("prompts.json is empty.");
  return flat;
}

function readImageAsBase64(p) {
  return fs.readFileSync(p).toString("base64");
}

function pickPrompt(prompts, manifest, avoidLastN = 3) {
  const recent = new Set(
    (manifest.runs || [])
      .slice(-avoidLastN)
      .map((r) => r.promptEffectText)
      .filter(Boolean)
  );
  const candidates = prompts.filter((p) => !recent.has(p));
  const pool = candidates.length ? candidates : prompts;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- One step ---------- */
async function main() {
  const t0 = Date.now();
  console.log("——— generateNano: start run ——─");

  const now = new Date();
  const todayMidnight = getTodayMidnight();
  const rows = await fetchRescueTimeData(todayMidnight, now);

  console.log("Raw data from RescueTime API:", rows);
  const unproductiveMinutes = calculateUnproductiveMinutes(rows);
  const todayImageCount = await getTodayImageCountLocal();

  console.log(`[gate] Total unproductive time today: ${unproductiveMinutes.toFixed(2)} minutes.`);
  console.log(`[gate] Images generated today: ${todayImageCount}`);

  // Calculate what threshold we should be at based on unproductive minutes
  const expectedImageCount = Math.floor(unproductiveMinutes / UNPRODUCTIVE_THRESHOLD_INCREMENT) + 1;

  if (todayImageCount >= expectedImageCount) {
    console.log(
      `[gate] Already generated ${todayImageCount} images. Next image at ${
        (todayImageCount + 1) * UNPRODUCTIVE_THRESHOLD_INCREMENT
      } minutes. Skipping image generation.`
    );
    console.log("——— generateNano: end run (skipped) ——─\n");
    return; // Exit the function early
  }

  console.log(
    `[gate] ✅ Threshold met. Should have ${expectedImageCount} images, but only have ${todayImageCount}. Proceeding with image generation.`
  );
  // --- END: PRODUCTIVITY GATE ---

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing in backend/.env");
  }

  const prompts = loadPromptsFlat();

  // Determine input image - get today's latest from Supabase or use base image for first run of day
  let inputBase64 = await getLatestImageToday();
  let usedBase = false;
  let firstRun = false;

  if (!inputBase64) {
    // No image from today exists, this is the first run of the day
    firstRun = true;
    const baseImage = path.join(IMAGES_DIR, "emily_base.jpg");

    if (!fs.existsSync(baseImage)) {
      throw new Error(`Base image not found at ${baseImage}`);
    }

    inputBase64 = readImageAsBase64(baseImage);
    usedBase = true;
  }

  // Pick one random effect (even on first run, just for logging)
  const effect = pickPrompt(prompts, { runs: [] }, 3);

  // Build full prompt:
  // - First run: your oil-painting instruction ONLY
  // - Later runs: the raw line from prompts.json ONLY
  const fullPrompt = firstRun ? FIRST_RUN_PROMPT : effect;

  // Logs
  console.log(`[config] model=${MODEL}`);
  console.log(`[run] firstRun=${firstRun} usedBase=${usedBase}`);
  console.log(`[prompt] ${firstRun ? "firstRunPrompt" : "effect"}="${fullPrompt}"`);

  // Call Gemini
  const base64 = inputBase64;
  const mimeType = "image/png"; // Default to PNG

  let res;
  try {
    res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ text: fullPrompt }, { inlineData: { mimeType, data: base64 } }],
    });
  } catch (e) {
    console.error("❌ generateContent error:", e?.message || e);
    throw e;
  }

  // Extract image from response
  const candidates = res?.candidates || res?.response?.candidates || [];
  if (!candidates.length) throw new Error("No candidates in response");
  const parts = candidates[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p?.inlineData?.data);
  if (!imgPart) throw new Error("No inlineData image part in first candidate");

  const imageBase64 = imgPart.inlineData.data;
  const textNote = parts.find((p) => p?.text)?.text || null;

  // Prepare metadata
  const metadata = {
    modelVersion: res.modelVersion || null,
    responseId: res.responseId || null,
    usedBase: usedBase,
    note: textNote,
    isJustin: false,
  };

  // Upload to Supabase
  const supabaseResult = await uploadImageToSupabase(imageBase64, "system", fullPrompt, metadata);

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(
    `✅ Image generated and uploaded to Supabase | responseId=${res.responseId || "n/a"} | ${dt}s`
  );
  console.log(`✅ Supabase file: ${supabaseResult[0].file_name}`);
  if (textNote) {
    console.log(`📝 AI Note: ${textNote}`);
  }
  console.log("——— generateNano: end run ——─\n");
}

main().catch((err) => {
  console.error("❌ decayStep failed:", err);
  process.exit(1);
});
