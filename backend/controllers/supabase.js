// Load environment variables first
import "../config.js";

import { createClient } from "@supabase/supabase-js";
import { decode } from "base64-arraybuffer";

// Initialize Supabase clients
let supabase = null;

// Service role client for bypassing RLS (used with authentication)
if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
} else {
  console.warn("⚠️  Supabase service role key not configured. Admin operations will be disabled.");
}

export const uploadImageToSupabase = async (imageBase64, user_id, prompt) => {
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

  // Insert into outputs table using service role (bypasses RLS)
  const { data, error } = await supabase
    .from("outputs")
    .insert({ file_name: image_path, prompt })
    .select();

  if (error) {
    throw error;
  }

  console.log(data);

  // Update latest_outputs using service role (bypasses RLS)
  const { error: error_latest } = await supabase
    .from("latest_outputs")
    .upsert({ id: user_id, file_id: data[0].id }, { onConflict: "id" });

  if (error_latest) {
    throw error_latest;
  }
  return data;
};
