// controllers/supabase.js

import "../config.js";
import { createClient } from "@supabase/supabase-js";
import { decode } from "base64-arraybuffer";

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("supabase_url", process.env.SUPABASE_URL);
  console.log("supabase_service_role_key", process.env.SUPABASE_SERVICE_ROLE_KEY);
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
} else {
  console.warn("⚠️  Supabase service role key not configured. Admin ops disabled.");
}

export function resolveUser(user) {
  const u = String(user || "").toLowerCase();
  if (u === "justin") return { isJustin: true, user: "justin" };
  if (u === "emily") return { isJustin: false, user: "emily" };
  throw new Error(`Unknown user "${user}". Expected "justin" or "emily".`);
}

export const getTodayImageCount = async (isJustinFlag) => {
  if (!supabase) throw new Error("Supabase not configured.");

  // Get today's date in Eastern time
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const today = new Date(easternTime.getFullYear(), easternTime.getMonth(), easternTime.getDate());
  const todayISO = today.toISOString();

  const { data, error } = await supabase
    .from("outputs")
    .select("id")
    .gte("created_at", todayISO)
    .eq("is_justin", isJustinFlag);

  if (error) throw error;
  return data ? data.length : 0;
};

export const getWeeklyImageCount = async (isJustinFlag) => {
  if (!supabase) throw new Error("Supabase not configured.");

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

  const weekStartISO = weekStart.toISOString();

  const { data, error } = await supabase
    .from("outputs")
    .select("id")
    .gte("created_at", weekStartISO)
    .eq("is_justin", isJustinFlag);

  if (error) throw error;
  return data ? data.length : 0;
};

export const getPortraitHistory = async (isJustinFlag) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error } = await supabase
    .from("outputs")
    .select(
      "id, version, prompt, file_name, model_version, response_id, used_base, note, is_justin, created_at"
    )
    .eq("is_justin", isJustinFlag)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data.map((record) => {
    const originalUrl = supabase.storage.from("images").getPublicUrl(record.file_name)
      .data.publicUrl;

    const imageUrl = supabase.storage.from("images").getPublicUrl(record.file_name, {
      transform: {
        quality: 60,
      },
    }).data.publicUrl;

    const thumbnailUrl = supabase.storage.from("images").getPublicUrl(record.file_name, {
      transform: {
        quality: 20,
      },
    }).data.publicUrl;

    return {
      id: record.id, // global PK (don't show on UI)
      version: record.version ?? record.id, // UI should use this
      prompt: record.prompt,
      file_name: record.file_name,
      model_version: record.model_version,
      response_id: record.response_id,
      used_base: record.used_base,
      note: record.note,
      is_justin: record.is_justin,
      timestamp: record.created_at,
      imageUrl,
      thumbnailUrl,
      originalUrl,
    };
  });
};

export const getLatestImageToday = async (isJustinFlag) => {
  if (!supabase) throw new Error("Supabase not configured.");

  // Get today's date in Eastern time
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const today = new Date(easternTime.getFullYear(), easternTime.getMonth(), easternTime.getDate());
  const todayISO = today.toISOString();

  const { data, error } = await supabase
    .from("outputs")
    .select("file_name")
    .gte("created_at", todayISO)
    .eq("is_justin", isJustinFlag)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const { data: imageData, error: downloadError } = await supabase.storage
    .from("images")
    .download(data[0].file_name);
  if (downloadError) throw downloadError;

  const arrayBuffer = await imageData.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
};

export const getLatestImageAnyDay = async (isJustinFlag) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error } = await supabase
    .from("outputs")
    .select("file_name")
    .eq("is_justin", isJustinFlag)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const { data: imageData, error: downloadError } = await supabase.storage
    .from("images")
    .download(data[0].file_name);
  if (downloadError) throw downloadError;

  const arrayBuffer = await imageData.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
};

export const getVideosForWeeks = async () => {
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error } = await supabase
    .from("videos")
    .select("id, week, is_justin, file_name")
    .in("week", [1, 2, 3, 4])
    .order("week", { ascending: true });

  if (error) throw error;

  // Group videos by week and user
  const videosByWeek = {};
  for (let week = 1; week <= 4; week++) {
    videosByWeek[week] = {
      justin: null,
      emily: null,
    };
  }

  data.forEach((video) => {
    const userKey = video.is_justin ? "justin" : "emily";
    videosByWeek[video.week][userKey] = {
      id: video.id,
      file_name: video.file_name,
      videoUrl: supabase.storage.from("videos").getPublicUrl(video.file_name).data.publicUrl,
    };
  });

  return videosByWeek;
};

export const uploadImageToSupabase = async (imageBase64, user_id, prompt, metadata = {}) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const image_path = `${Date.now()}.png`;

  await supabase.storage
    .from("images")
    .upload(image_path, decode(imageBase64), { contentType: "image/png" });

  // Get next version for this user partition (is_justin)
  const { data: last, error: selErr } = await supabase
    .from("outputs")
    .select("version")
    .eq("is_justin", metadata.isJustin ?? false)
    .order("version", { ascending: false })
    .limit(1);
  if (selErr) throw selErr;

  const nextVersion = (last?.[0]?.version ?? 0) + 1;

  const insertData = {
    file_name: image_path,
    prompt,
    model_version: metadata.modelVersion ?? null,
    response_id: metadata.responseId ?? null,
    used_base: metadata.usedBase ?? false,
    note: metadata.note ?? null,
    is_justin: metadata.isJustin ?? false,
    version: nextVersion, // ← per-user version
  };

  const { data, error } = await supabase.from("outputs").insert(insertData).select();

  if (error) throw error;
  return data;
};
