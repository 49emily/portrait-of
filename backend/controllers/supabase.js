// Load environment variables first
import "../config.js";

import { createClient } from "@supabase/supabase-js";
import { decode } from "base64-arraybuffer";

// Initialize Supabase clients
let supabase = null;

// Service role client for bypassing RLS (used with authentication)
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
} else {
  console.warn("⚠️  Supabase service role key not configured. Admin operations will be disabled.");
}

export const getTodayImageCount = async () => {
  if (!supabase) {
    throw new Error(
      "Supabase service role is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
    );
  }

  // Get start of today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // Query outputs table for images created today
  const { data, error } = await supabase.from("outputs").select("id").gte("created_at", todayISO);

  if (error) {
    throw error;
  }

  return data ? data.length : 0;
};

export const getAllPortraitHistory = async () => {
  if (!supabase) {
    throw new Error(
      "Supabase service role is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
    );
  }

  // Get all outputs ordered by creation time (newest first)
  const { data, error } = await supabase
    .from("outputs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  // Transform data to match the expected frontend format
  const history = data.map((record) => ({
    id: record.id,
    version: record.id, // Use id as version for now
    prompt: record.prompt,
    file_name: record.file_name,
    model_version: record.model_version,
    response_id: record.response_id,
    used_base: record.used_base,
    note: record.note,
    is_justin: record.is_justin,
    timestamp: record.created_at,
    // Generate public URL for the image
    imageUrl: supabase.storage.from("images").getPublicUrl(record.file_name).data.publicUrl,
  }));

  return history;
};

export const getLatestImageToday = async () => {
  if (!supabase) {
    throw new Error(
      "Supabase service role is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
    );
  }

  // Get start of today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // Get the most recent image from today
  const { data, error } = await supabase
    .from("outputs")
    .select("file_name")
    .gte("created_at", todayISO)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  // Download the image from storage
  const { data: imageData, error: downloadError } = await supabase.storage
    .from("images")
    .download(data[0].file_name);

  if (downloadError) {
    throw downloadError;
  }

  // Convert to base64
  const arrayBuffer = await imageData.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return base64;
};

export const uploadImageToSupabase = async (imageBase64, user_id, prompt, metadata = {}) => {
  if (!supabase) {
    throw new Error(
      "Supabase service role is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
    );
  }

  const image_path = `${Date.now()}.png`;

  // Upload image using service role (bypasses RLS)
  await supabase.storage
    .from("images")
    .upload(image_path, decode(imageBase64), { contentType: "image/png" });

  // Prepare the insert data with metadata
  const insertData = {
    file_name: image_path,
    prompt,
    model_version: metadata.modelVersion || null,
    response_id: metadata.responseId || null,
    used_base: metadata.usedBase || false,
    note: metadata.note || null,
    is_justin: metadata.isJustin || false,
  };

  // Insert into outputs table using service role (bypasses RLS)
  const { data, error } = await supabase.from("outputs").insert(insertData).select();

  if (error) {
    throw error;
  }

  console.log(data);

  return data;
};
