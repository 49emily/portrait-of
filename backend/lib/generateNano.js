// backend/lib/generateNano.js

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import {
  uploadImageToSupabase,
  getTodayImageCount,
  getWeeklyImageCount,
  getLatestImageToday,
  getLatestImageAnyDay, // <— NEW
  resolveUser,
} from "../controllers/supabase.js";

// ---------- CLI: --user=justin|emily ----------
const argUser = (process.argv.find((a) => a.startsWith("--user=")) || "").split("=")[1];
if (!argUser) {
  console.error("❌ Missing --user. Usage: node generateNano.js --user=justin|emily");
  process.exit(1);
}
const { isJustin, user } = resolveUser(argUser);

// ---------- Weekly reset configuration ----------
const WEEKLY_RESET_DAY = 0; // Sunday

// ---------- Paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.join(__dirname, "..");
const IMAGES_DIR = path.join(BACKEND_DIR, "images");
const PROMPTS_PATH = path.join(BACKEND_DIR, "prompts.json");

// ---------- Config ----------
const MODEL = "gemini-2.5-flash-image-preview";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FIRST_RUN_PROMPT =
  "Show this photograph as an oil portrait in a golden frame hanging in a gallery against a dark wall. Make it well-lit and bright. Make the portrait resemble the image closely.";

const UNPRODUCTIVE_THRESHOLD_INCREMENT = 30;

// RescueTime keys per user
const RESCUETIME_KEYS = {
  justin: process.env.RESCUETIME_API_KEY_JUSTIN,
  emily: process.env.RESCUETIME_API_KEY_EMILY,
};
const RESCUETIME_API_KEY = RESCUETIME_KEYS[user];
if (!RESCUETIME_API_KEY) {
  console.error(
    `❌ Missing RescueTime key for ${user}. Did you set RESCUETIME_API_KEY_${user.toUpperCase()}?`
  );
  process.exit(1);
}

// ---------- Utils ----------
function getTodayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getWeekStartMidnight() {
  // Get start of current week (Sunday 12 AM Eastern)
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  // Get the current day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = easternTime.getDay();

  // Calculate days to subtract to get to Sunday
  const daysToSubtract = dayOfWeek;

  // Create Sunday midnight
  const weekStart = new Date(
    easternTime.getFullYear(),
    easternTime.getMonth(),
    easternTime.getDate()
  );
  weekStart.setDate(weekStart.getDate() - daysToSubtract);

  return weekStart;
}

function getCurrentTimeInEastern() {
  // Get current time in Eastern timezone
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

async function fetchRescueTimeData(startTime, endTime) {
  const startDate = new Date(startTime.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const endDate = endTime.toISOString().split("T")[0];

  const params = {
    key: RESCUETIME_API_KEY,
    perspective: "interval",
    resolution_time: "minute",
    restrict_begin: startDate,
    restrict_end: endDate,
    restrict_kind: "activity",
    format: "json",
  };

  try {
    const response = await axios.get("https://www.rescuetime.com/anapi/data", {
      params,
    });
    const allRows = response.data.rows || [];
    return allRows.filter((row) => {
      const timestamp = new Date(row[0]);
      return timestamp >= startTime && timestamp <= endTime;
    });
  } catch (error) {
    console.error("❌ RescueTime API Error:", error.response?.data || error.message);
    return [];
  }
}

function calculateUnproductiveMinutes(rows) {
  const unproductiveSeconds = rows
    .filter((row) => row[5] < 0)
    .reduce((total, row) => total + (row[1] || 0), 0);
  return unproductiveSeconds / 60;
}

function loadPromptsFlat() {
  if (!fs.existsSync(PROMPTS_PATH)) throw new Error(`prompts.json not found at ${PROMPTS_PATH}`);
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

// ---------- Weekly reset decision ----------
async function selectInputImage({ isJustin }) {
  // First, see if there is any image ever
  const latestAny = await getLatestImageAnyDay(isJustin);
  const latestToday = await getLatestImageToday(isJustin);

  // If no history at all, must use base
  if (!latestAny) {
    return { base64: null, forceBase: true, reason: "no-history" };
  }

  // Weekly reset logic: reset on Sunday, continue chaining other days
  const today = new Date();
  const dow = today.getDay(); // Sun=0...Sat=6

  if (dow === WEEKLY_RESET_DAY) {
    // On Sunday: first generation of the day uses base image
    return latestToday
      ? { base64: latestAny, forceBase: false, reason: "weekly-has-today" }
      : { base64: null, forceBase: true, reason: "weekly-first-of-day" };
  }

  // Non-Sunday: continue chaining from latest image
  return {
    base64: latestAny,
    forceBase: false,
    reason: "weekly-non-reset-day",
  };
}

// ---------- One step ----------
async function main() {
  const t0 = Date.now();
  console.log(`——— generateNano (${user}): start run ——─ (weekly reset on Sunday)`);

  const nowEastern = getCurrentTimeInEastern();
  const weekStartMidnight = getWeekStartMidnight();
  const rows = await fetchRescueTimeData(weekStartMidnight, nowEastern);

  const unproductiveMinutes = calculateUnproductiveMinutes(rows);
  const weeklyImageCount = await getWeeklyImageCount(isJustin);

  console.log(
    `[gate][${user}] Unproductive this week: ${unproductiveMinutes.toFixed(
      2
    )} min | images this week: ${weeklyImageCount}`
  );

  const expectedImageCount = Math.floor(unproductiveMinutes / UNPRODUCTIVE_THRESHOLD_INCREMENT) + 1;

  if (weeklyImageCount >= expectedImageCount) {
    console.log(
      `[gate][${user}] Next image at ${
        (weeklyImageCount + 1) * UNPRODUCTIVE_THRESHOLD_INCREMENT
      } min. Skipping.`
    );
    console.log("——— generateNano: end run (skipped) ——─\n");
    return;
  }

  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing in backend/.env");
  const prompts = loadPromptsFlat();

  // Decide input image based on weekly reset policy
  const sel = await selectInputImage({ isJustin });
  let inputBase64 = sel.base64;
  let usedBase = false;
  let firstRun = false;

  if (sel.forceBase) {
    firstRun = true;
    const baseName = user === "justin" ? "justin_base.png" : "emily_base.jpg";
    const baseImage = path.join(IMAGES_DIR, baseName);
    if (!fs.existsSync(baseImage)) throw new Error(`Base image not found at ${baseImage}`);
    inputBase64 = readImageAsBase64(baseImage);
    usedBase = true;
  }

  const effect = pickPrompt(prompts, { runs: [] }, 3);
  const stabilizePrompt =
    "Do not make the painting smaller in the output. Try to retain facial features and details.";
  const fullPrompt = firstRun ? FIRST_RUN_PROMPT : `${effect} ${stabilizePrompt}`;

  console.log(`[config] model=${MODEL}`);
  console.log(`[run] user=${user} firstRun=${firstRun} usedBase=${usedBase} reason=${sel.reason}`);
  console.log(`[prompt] ${firstRun ? "firstRunPrompt" : "effect"}="${fullPrompt}"`);

  // Gemini
  const mimeType = "image/png";
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ text: fullPrompt }, { inlineData: { mimeType, data: inputBase64 } }],
  });

  const candidates = res?.candidates || res?.response?.candidates || [];
  if (!candidates.length) throw new Error("No candidates in response");
  const parts = candidates[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p?.inlineData?.data);
  if (!imgPart) throw new Error("No inlineData image part in first candidate");

  const imageBase64 = imgPart.inlineData.data;
  const textNote = parts.find((p) => p?.text)?.text || null;

  const metadata = {
    modelVersion: res.modelVersion || null,
    responseId: res.responseId || null,
    usedBase: usedBase,
    note: textNote,
    isJustin: isJustin,
  };

  const supabaseResult = await uploadImageToSupabase(
    imageBase64,
    user,
    firstRun ? FIRST_RUN_PROMPT : effect,
    metadata
  );

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(
    `✅ (${user}) Image generated & uploaded | responseId=${res.responseId || "n/a"} | ${dt}s`
  );
  console.log(`✅ Supabase file: ${supabaseResult[0].file_name}`);
  if (textNote) console.log(`📝 AI Note: ${textNote}`);
  console.log("——— generateNano: end run ——─\n");
}

main().catch((err) => {
  console.error("❌ generateNano failed:", err);
  process.exit(1);
});
