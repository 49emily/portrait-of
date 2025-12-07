// controllers/supabase.js

import "../config.js";
import { createClient } from "@supabase/supabase-js";
import { decode } from "base64-arraybuffer";

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
} else {
  console.warn("⚠️  Supabase service role key not configured. Admin ops disabled.");
}

export function resolveUser(user) {
  const u = String(user || "").toLowerCase();
  const validUsers = ["justin", "emily", "lele", "serena", "tiffany", "isaac", "ameya"];

  if (!validUsers.includes(u)) {
    throw new Error(`Unknown user "${user}". Expected one of: ${validUsers.join(", ")}`);
  }

  return { user: u, personName: u };
}

// Helper to get midnight Eastern for a given date, returned as UTC Date object
function getMidnightEastern(date = new Date()) {
  // Get the date in Eastern timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;

  // Try both possible offsets (EDT=-04:00, EST=-05:00) and use the one that
  // produces the correct date when converted back to Eastern
  for (const offset of ["-04:00", "-05:00"]) {
    const testDate = new Date(`${year}-${month}-${day}T00:00:00${offset}`);
    const testParts = formatter.formatToParts(testDate);
    const testYear = testParts.find((p) => p.type === "year").value;
    const testMonth = testParts.find((p) => p.type === "month").value;
    const testDay = testParts.find((p) => p.type === "day").value;

    if (testYear === year && testMonth === month && testDay === day) {
      return testDate;
    }
  }

  // Fallback (should not reach here)
  return new Date(`${year}-${month}-${day}T00:00:00-05:00`);
}

// Get current date components in Eastern timezone
function getEasternDateComponents(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find((p) => p.type === "year").value),
    month: parseInt(parts.find((p) => p.type === "month").value),
    day: parseInt(parts.find((p) => p.type === "day").value),
    weekday: parts.find((p) => p.type === "weekday").value,
  };
}

export const getTodayImageCount = async (personName) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const todayMidnight = getMidnightEastern();
  const todayISO = todayMidnight.toISOString();

  const { data, error } = await supabase
    .from("outputs")
    .select("id")
    .gte("created_at", todayISO)
    .eq("person_name", personName);

  if (error) throw error;
  return data ? data.length : 0;
};

export const getWeeklyImageCount = async (personName) => {
  if (!supabase) throw new Error("Supabase not configured.");

  // Get start of current week (Sunday 12 AM Eastern)
  const now = new Date();
  const { weekday } = getEasternDateComponents(now);

  // Map weekday to number (Sun=0, Mon=1, etc.)
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[weekday];

  // Calculate Sunday's date by going back dayOfWeek days
  const sundayDate = new Date(now);
  sundayDate.setDate(sundayDate.getDate() - dayOfWeek);

  const weekStartMidnight = getMidnightEastern(sundayDate);
  const weekStartISO = weekStartMidnight.toISOString();

  const { data, error } = await supabase
    .from("outputs")
    .select("id")
    .gte("created_at", weekStartISO)
    .eq("person_name", personName);

  if (error) throw error;
  return data ? data.length : 0;
};

export const getPortraitHistory = async (personName) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error } = await supabase
    .from("outputs")
    .select(
      "id, version, prompt, file_name, model_version, response_id, used_base, note, person_name, created_at"
    )
    .eq("person_name", personName)
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
      person_name: record.person_name,
      timestamp: record.created_at,
      imageUrl,
      thumbnailUrl,
      originalUrl,
    };
  });
};

export const getLatestImageToday = async (personName) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const todayMidnight = getMidnightEastern();
  const todayISO = todayMidnight.toISOString();

  const { data, error } = await supabase
    .from("outputs")
    .select("file_name")
    .gte("created_at", todayISO)
    .eq("person_name", personName)
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

export const getLatestImageAnyDay = async (personName) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const { data, error } = await supabase
    .from("outputs")
    .select("file_name")
    .eq("person_name", personName)
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
    .select("id, week, person_name, file_name")
    .in("week", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    .order("week", { ascending: true });

  if (error) throw error;

  // Group videos by week and user
  const videosByWeek = {};
  for (let week = 1; week <= 10; week++) {
    videosByWeek[week] = {
      justin: null,
      emily: null,
    };
  }

  data.forEach((video) => {
    const userKey = video.person_name;
    if (!videosByWeek[video.week]) {
      videosByWeek[video.week] = {};
    }
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

  // Get next version for this user partition (person_name)
  const personName = metadata.personName;
  if (!personName) throw new Error("metadata.personName is required");

  const { data: last, error: selErr } = await supabase
    .from("outputs")
    .select("version")
    .eq("person_name", personName)
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
    person_name: personName,
    version: nextVersion, // ← per-user version
  };

  const { data, error } = await supabase.from("outputs").insert(insertData).select();

  if (error) throw error;
  return data;
};
