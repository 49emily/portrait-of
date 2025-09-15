import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

/* ---------- Paths ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.join(__dirname, "..");
const IMAGES_DIR = path.join(BACKEND_DIR, "images");
const OUT_DIR = path.join(BACKEND_DIR, "out");
const PROMPTS_PATH = path.join(BACKEND_DIR, "prompts.json");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

/* ---------- Config ---------- */
const MODEL = "gemini-2.5-flash-image-preview";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Keep this as your oil-painting instruction for run #1
const FIRST_RUN_PROMPT =
  "Render this photograph as a realistic oil portrait in a golden frame like a painting in an art museum exhibit. Preserve the subject's exact likeness and the original composition of the photo.";

/* ---------- Utils ---------- */
function ensureDirs() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { runs: [] };
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
}

function saveManifest(m) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

function nextVersion(manifest) {
  return (manifest.runs?.length || 0) + 1;
}

function versionFilename(idx, ext = "png") {
  return `dorian_v${String(idx).padStart(3, "0")}.${ext}`;
}

function latestOutputPath() {
  if (!fs.existsSync(OUT_DIR)) return null;
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => /^dorian_v\d{3}\.(png|jpe?g)$/i.test(f))
    .sort();
  return files.length ? path.join(OUT_DIR, files[files.length - 1]) : null;
}

function readImageAsBase64(p) {
  return fs.readFileSync(p).toString("base64");
}

function guessMimeFromName(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
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

function extractFirstImageAndSave(res, outPath) {
  const candidates = res?.candidates || res?.response?.candidates || [];
  if (!candidates.length) throw new Error("No candidates in response");
  const parts = candidates[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p?.inlineData?.data);
  if (!imgPart) throw new Error("No inlineData image part in first candidate");

  const buf = Buffer.from(imgPart.inlineData.data, "base64");
  fs.writeFileSync(outPath, buf);

  const textNote = parts.find((p) => p?.text)?.text || null;
  return {
    modelVersion: res.modelVersion || null,
    responseId: res.responseId || null,
    textNote,
  };
}

/* ---------- One step ---------- */
async function main() {
  const t0 = Date.now();
  console.log("——— generateNano: start run ——─");

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing in backend/.env");
  }

  ensureDirs();
  const manifest = loadManifest();
  const prompts = loadPromptsFlat();

  // Determine input image
  let inputPath = latestOutputPath();
  let usedBase = false;
  let firstRun = false;

  if (!inputPath) {
    firstRun = true;
    const baseImage = path.join(IMAGES_DIR, "justin_base.png");

    if (!fs.existsSync(baseImage)) {
      throw new Error(`Base image not found at ${baseImage}`);
    }

    inputPath = baseImage;
    usedBase = true;
  }

  // Pick one random effect (even on first run, just for logging/manifest)
  const effect = pickPrompt(prompts, manifest, 3);

  // Build full prompt:
  // - First run: your oil-painting instruction ONLY
  // - Later runs: the raw line from prompts.json ONLY
  const fullPrompt = firstRun ? FIRST_RUN_PROMPT : effect;

  // Logs
  console.log(`[config] model=${MODEL}`);
  console.log(`[run] firstRun=${firstRun} usedBase=${usedBase}`);
  console.log(`[paths] input=${path.relative(BACKEND_DIR, inputPath)}`);
  console.log(
    `[prompt] ${firstRun ? "firstRunPrompt" : "effect"}="${fullPrompt}"`
  );

  // Call Gemini
  const base64 = readImageAsBase64(inputPath);
  const mimeType = guessMimeFromName(inputPath);

  let res;
  try {
    res = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { text: fullPrompt },
        { inlineData: { mimeType, data: base64 } },
      ],
    });
  } catch (e) {
    console.error("❌ generateContent error:", e?.message || e);
    throw e;
  }

  // Save output
  const idx = nextVersion(manifest);
  const outExt = mimeType.endsWith("jpeg") ? "jpg" : "png";
  const outName = versionFilename(idx, outExt);
  const outPath = path.join(OUT_DIR, outName);
  const meta = extractFirstImageAndSave(res, outPath);

  // Manifest entry
  const entry = {
    version: idx,
    input: path.relative(BACKEND_DIR, inputPath),
    output: path.relative(BACKEND_DIR, outPath),
    promptFull: fullPrompt,
    promptEffectText: firstRun ? "(first-run)" : effect,
    modelVersion: meta.modelVersion,
    responseId: meta.responseId,
    note: meta.textNote,
    usedBaseOnThisRun: usedBase,
    timestamp: new Date().toISOString(),
  };
  manifest.runs.push(entry);
  saveManifest(manifest);

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(
    `✅ v${String(idx).padStart(3, "0")} | ${path.basename(
      inputPath
    )} -> ${outName} | responseId=${meta.responseId || "n/a"} | ${dt}s`
  );
  console.log("——— generateNano: end run ——─\n");
}

main().catch((err) => {
  console.error("❌ decayStep failed:", err);
  process.exit(1);
});
