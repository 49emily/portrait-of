// scripts/regenerate-emily-v25-29.js
// Regenerates Emily's portraits versions 25-29 for week 3, properly chaining from version 24

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import "../config.js";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { decode } from "base64-arraybuffer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.join(__dirname, "..");
const PROMPTS_PATH = path.join(BACKEND_DIR, "prompts.json");

// Config
const MODEL = "gemini-2.5-flash-image-preview";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VERSIONS_TO_REGENERATE = [25, 26, 27, 28, 29];
const START_VERSION = 24; // We'll fetch this as the starting point
const USER = "emily";
const IS_JUSTIN = false;

// Load prompts
function loadPromptsFlat() {
  if (!fs.existsSync(PROMPTS_PATH)) {
    throw new Error(`prompts.json not found at ${PROMPTS_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(PROMPTS_PATH, "utf-8"));
  const flat = Array.isArray(raw) ? raw : Object.values(raw).flat();
  if (!flat.length) throw new Error("prompts.json is empty.");
  return flat;
}

// Fetch image by version from Supabase
async function fetchImageByVersion(version) {
  console.log(`📥 Fetching version ${version} for ${USER}...`);

  const { data, error } = await supabase
    .from("outputs")
    .select("file_name, prompt")
    .eq("is_justin", IS_JUSTIN)
    .eq("version", version)
    .single();

  if (error) throw error;
  if (!data) throw new Error(`Version ${version} not found`);

  // Download the image
  const { data: imageData, error: downloadError } = await supabase.storage
    .from("images")
    .download(data.file_name);

  if (downloadError) throw downloadError;

  const arrayBuffer = await imageData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  console.log(`✅ Fetched version ${version}: ${data.file_name}`);
  return { base64, fileName: data.file_name, prompt: data.prompt };
}

// Delete old record and image
async function deleteOldVersion(version) {
  console.log(`🗑️  Deleting old version ${version}...`);

  // Get the old record first
  const { data: oldRecord, error: fetchError } = await supabase
    .from("outputs")
    .select("file_name")
    .eq("is_justin", IS_JUSTIN)
    .eq("version", version)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116 = not found
    throw fetchError;
  }

  if (oldRecord) {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("images")
      .remove([oldRecord.file_name]);

    if (storageError) {
      console.warn(`⚠️  Could not delete image ${oldRecord.file_name}:`, storageError.message);
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from("outputs")
      .delete()
      .eq("is_justin", IS_JUSTIN)
      .eq("version", version);

    if (dbError) throw dbError;

    console.log(`✅ Deleted old version ${version}`);
  } else {
    console.log(`ℹ️  Version ${version} doesn't exist yet, will create new`);
  }
}

// Upload new image with specific version
async function uploadImageWithVersion(imageBase64, prompt, version, metadata = {}) {
  const image_path = `emily_v${version}_${Date.now()}.png`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from("images")
    .upload(image_path, decode(imageBase64), { contentType: "image/png" });

  if (uploadError) throw uploadError;

  // Insert into database with specified version
  const insertData = {
    file_name: image_path,
    prompt,
    model_version: metadata.modelVersion || null,
    response_id: metadata.responseId || null,
    used_base: false,
    note: metadata.note || null,
    is_justin: IS_JUSTIN,
    version: version,
  };

  const { data, error } = await supabase.from("outputs").insert(insertData).select();

  if (error) throw error;

  console.log(`✅ Uploaded version ${version}: ${image_path}`);
  return data[0];
}

// Generate one image
async function generateImage(inputBase64, prompt) {
  console.log(`🎨 Generating with prompt: "${prompt}"`);

  const mimeType = "image/png";
  const fullPrompt = `${prompt} Do not make the painting smaller in the output.`;

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

  return {
    imageBase64,
    modelVersion: res.modelVersion || null,
    responseId: res.responseId || null,
    note: textNote,
  };
}

// Main regeneration logic
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 REGENERATING EMILY'S VERSIONS 25-29 (WEEK 3)");
  console.log("=".repeat(60) + "\n");

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing in .env");
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials missing in .env");
  }

  const prompts = loadPromptsFlat();
  console.log(`📚 Loaded ${prompts.length} prompts\n`);

  // Step 1: Fetch version 24 as the starting point
  console.log("Step 1: Fetching version 24 as base...");
  const { base64: inputBase64 } = await fetchImageByVersion(START_VERSION);

  let currentBase64 = inputBase64;

  // Step 2: Regenerate versions 25-29
  console.log("\nStep 2: Regenerating versions 25-29...\n");

  for (const version of VERSIONS_TO_REGENERATE) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`Processing version ${version}...`);
    console.log("─".repeat(50));

    // Delete old version
    await deleteOldVersion(version);

    // Pick a random prompt (different each time)
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    // Generate new image using the previous version
    const result = await generateImage(currentBase64, prompt);

    // Upload with the correct version number
    const metadata = {
      modelVersion: result.modelVersion,
      responseId: result.responseId,
      note: result.note,
    };

    await uploadImageWithVersion(result.imageBase64, prompt, version, metadata);

    // Update current base for next iteration
    currentBase64 = result.imageBase64;

    console.log(`✅ Version ${version} complete!`);

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 ALL VERSIONS REGENERATED SUCCESSFULLY!");
  console.log("=".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("\n❌ REGENERATION FAILED:", err);
  process.exit(1);
});
