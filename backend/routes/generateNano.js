// backend/routes/generateNano.js

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
  getLatestImageAnyDay, // <— NEW
  resolveUser,
} from "../controllers/supabase.js";

// ---------- CLI: --user=justin|emily ----------
const argUser = (process.argv.find((a) => a.startsWith("--user=")) || "").split(
  "="
)[1];
if (!argUser) {
  console.error(
    "❌ Missing --user. Usage: node generateNano.js --user=justin|emily"
  );
  process.exit(1);
}
const { isJustin, user } = resolveUser(argUser);

// ---------- Reset policy parsing ----------
const argReset =
  (process.argv.find((a) => a.startsWith("--reset=")) || "").split("=")[1] ||
  process.env.RESET_MODE ||
  "never"; // never | daily | weekly | always

// Accept 0-7; JS getDay(): Sun=0, Mon=1, ... Sat=6
const argWeeklyDayRaw =
  (process.argv.find((a) => a.startsWith("--weekly-day=")) || "").split(
    "="
  )[1] ||
  process.env.WEEKLY_RESET_DAY ||
  "1"; // default Monday

const WEEKLY_RESET_DAY = (() => {
  const n = Number(argWeeklyDayRaw);
  if (Number.isNaN(n)) return 1;
  if (n === 7) return 0; // allow 7 for Sunday
  return Math.min(Math.max(n, 0), 6);
})();

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
  "Render this photograph as a realistic oil portrait in a golden frame like a painting in an art museum exhibit. Preserve the subject's exact likeness and the original composition of the photo.";

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

async function fetchRescueTimeData(startTime, endTime) {
  const startDate = new Date(startTime.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
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
    console.error(
      "❌ RescueTime API Error:",
      error.response?.data || error.message
    );
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
  if (!fs.existsSync(PROMPTS_PATH))
    throw new Error(`prompts.json not found at ${PROMPTS_PATH}`);
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

// ---------- Reset decision ----------
async function selectInputImage({ isJustin, user, resetMode }) {
  // First, see if there is any image ever
  const latestAny = await getLatestImageAnyDay(isJustin);
  const latestToday = await getLatestImageToday(isJustin);

  // If no history at all, must use base
  if (!latestAny) {
    return { base64: null, forceBase: true, reason: "no-history" };
  }

  // Decide policy
  const today = new Date();
  const dow = today.getDay(); // Sun=0...Sat=6

  switch ((resetMode || "never").toLowerCase()) {
    case "always":
      return { base64: null, forceBase: true, reason: "always" };
    case "daily":
      // If we haven't generated today yet, start from base; otherwise chain from latest
      return latestToday
        ? { base64: latestAny, forceBase: false, reason: "daily-has-today" }
        : { base64: null, forceBase: true, reason: "daily-first-of-day" };
    case "weekly":
      if (dow === WEEKLY_RESET_DAY) {
        // On reset weekday: first generation of the day uses base
        return latestToday
          ? { base64: latestAny, forceBase: false, reason: "weekly-has-today" }
          : { base64: null, forceBase: true, reason: "weekly-first-of-day" };
      }
      return {
        base64: latestAny,
        forceBase: false,
        reason: "weekly-non-reset-day",
      };
    case "never":
    default:
      return { base64: latestAny, forceBase: false, reason: "never" };
  }
}

// ---------- One step ----------
async function main() {
  const t0 = Date.now();
  console.log(
    `——— generateNano (${user}): start run ——─ (reset=${argReset}, weeklyDay=${WEEKLY_RESET_DAY})`
  );

  const now = new Date();
  const todayMidnight = getTodayMidnight();
  const rows = await fetchRescueTimeData(todayMidnight, now);

  const unproductiveMinutes = calculateUnproductiveMinutes(rows);
  const todayImageCount = await getTodayImageCount(isJustin);

  console.log(
    `[gate][${user}] Unproductive today: ${unproductiveMinutes.toFixed(
      2
    )} min | images today: ${todayImageCount}`
  );

  const expectedImageCount =
    Math.floor(unproductiveMinutes / UNPRODUCTIVE_THRESHOLD_INCREMENT) + 1;

  if (todayImageCount >= expectedImageCount) {
    console.log(
      `[gate][${user}] Next image at ${
        (todayImageCount + 1) * UNPRODUCTIVE_THRESHOLD_INCREMENT
      } min. Skipping.`
    );
    console.log("——— generateNano: end run (skipped) ——─\n");
    return;
  }

  if (!process.env.GEMINI_API_KEY)
    throw new Error("GEMINI_API_KEY missing in backend/.env");
  const prompts = loadPromptsFlat();

  // Decide input image based on reset policy
  const sel = await selectInputImage({ isJustin, user, resetMode: argReset });
  let inputBase64 = sel.base64;
  let usedBase = false;
  let firstRun = false;

  if (sel.forceBase) {
    firstRun = true;
    const baseName = user === "justin" ? "justin_base.png" : "emily_base.jpg";
    const baseImage = path.join(IMAGES_DIR, baseName);
    if (!fs.existsSync(baseImage))
      throw new Error(`Base image not found at ${baseImage}`);
    inputBase64 = readImageAsBase64(baseImage);
    usedBase = true;
  }

  const effect = pickPrompt(prompts, { runs: [] }, 3);
  const fullPrompt = firstRun ? FIRST_RUN_PROMPT : effect;

  console.log(`[config] model=${MODEL}`);
  console.log(
    `[run] user=${user} firstRun=${firstRun} usedBase=${usedBase} reason=${sel.reason}`
  );
  console.log(
    `[prompt] ${firstRun ? "firstRunPrompt" : "effect"}="${fullPrompt}"`
  );

  // Gemini
  const mimeType = "image/png";
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { text: fullPrompt },
      { inlineData: { mimeType, data: inputBase64 } },
    ],
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
    fullPrompt,
    metadata
  );

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(
    `✅ (${user}) Image generated & uploaded | responseId=${
      res.responseId || "n/a"
    } | ${dt}s`
  );
  console.log(`✅ Supabase file: ${supabaseResult[0].file_name}`);
  if (textNote) console.log(`📝 AI Note: ${textNote}`);
  console.log("——— generateNano: end run ——─\n");
}

main().catch((err) => {
  console.error("❌ generateNano failed:", err);
  process.exit(1);
});
