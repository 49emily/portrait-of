// backend/api/index.js

// Load environment variables first
import "../config.js";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import { resolveUser, getPortraitHistory, getVideosForWeeks } from "../controllers/supabase.js";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Configure CORS to allow requests from the frontend domain
app.use(
  cors({
    origin: [
      "https://www.portraitofyou.space",
      "http://localhost:5173", // For local development
      "http://localhost:3000", // For local development
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// ---- User map to pick the right RescueTime API key ----
const RESCUETIME_KEYS = {
  justin: process.env.RESCUETIME_API_KEY_JUSTIN,
  emily: process.env.RESCUETIME_API_KEY_EMILY,
};

// --- Utils ---

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

function getTodayMidnight() {
  return getMidnightEastern();
}

function getWeekStartMidnight() {
  // Get start of current week (Sunday 12 AM Eastern)
  const now = new Date();

  // Get the current day of week in Eastern timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const weekday = formatter.format(now);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[weekday];

  // Calculate Sunday's date by going back dayOfWeek days
  const sundayDate = new Date(now);
  sundayDate.setDate(sundayDate.getDate() - dayOfWeek);

  return getMidnightEastern(sundayDate);
}

function getCurrentTimeInEastern() {
  // Return the current time as-is (it's already UTC, which can be compared with DB timestamps)
  return new Date();
}

async function fetchRescueTimeDataForUser(user, startTime, endTime) {
  const apiKey = RESCUETIME_KEYS[user];
  if (!apiKey) throw new Error(`Missing RescueTime key for ${user}`);

  // Pull a larger range and then filter locally to the minute
  const startDate = new Date(startTime.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const endDate = endTime.toISOString().split("T")[0];

  const params = {
    key: apiKey,
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
    console.error(`❌ RescueTime API Error (${user}):`, error.response?.data || error.message);
    return [];
  }
}

function calculateUnproductiveMinutes(rows) {
  const unproductiveSeconds = rows
    .filter((row) => row[5] < 0)
    .reduce((total, row) => total + (row[1] || 0), 0);
  return unproductiveSeconds / 60;
}

function getMostRecentUnproductiveActivity(rows) {
  const unproductiveRows = rows
    .filter((row) => row[5] < 0)
    .sort((a, b) => new Date(b[0]) - new Date(a[0])); // Sort by timestamp descending

  if (unproductiveRows.length === 0) {
    return null;
  }

  const mostRecent = unproductiveRows[0];
  return {
    timestamp: mostRecent[0],
    activity: mostRecent[3],
    category: mostRecent[4],
    timeMinutes: Math.round(((mostRecent[1] || 0) / 60) * 100) / 100,
  };
}

function getStartDateFromEnv() {
  const startDateStr = process.env.TOTAL_START_DATE;
  if (!startDateStr) {
    console.warn("⚠️  TOTAL_START_DATE not configured, using default 2024-01-01");
    return new Date("2024-01-01T00:00:00-05:00"); // Default to Jan 1, 2024 Eastern
  }
  return new Date(`${startDateStr}T00:00:00-05:00`); // Parse as Eastern time
}

// --- Health ---
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// --- Root (describe routes) ---
app.get("/", (req, res) => {
  res.json({
    message: "Dorian Portrait Viewer API",
    version: "2.0.0",
    endpoints: {
      "/api/justin/portrait-history": "Justin's generations",
      "/api/justin/current-screentime": "Justin's weekly unproductive minutes + thresholds",
      "/api/emily/portrait-history": "Emily's generations",
      "/api/emily/current-screentime": "Emily's weekly unproductive minutes + thresholds",
      "/health": "Health check",
    },
  });
});

// --- User-scoped routes ---
app.get("/api/:user/portrait-history", async (req, res) => {
  try {
    const { user } = req.params; // 'justin' | 'emily'
    const { isJustin } = resolveUser(user);

    const history = await getPortraitHistory(isJustin);
    res.json({ success: true, user, history });
  } catch (error) {
    console.error("Error fetching portrait history:", error);
    res.status(400).json({
      success: false,
      error: "Failed to fetch portrait history.",
      message: error.message,
    });
  }
});

// --- Videos route ---
app.get("/api/videos", async (req, res) => {
  try {
    const videos = await getVideosForWeeks();
    res.json({ success: true, videos });
  } catch (error) {
    console.error("Error fetching videos:", error);
    res.status(400).json({
      success: false,
      error: "Failed to fetch videos.",
      message: error.message,
    });
  }
});

app.get("/api/:user/current-screentime", async (req, res) => {
  try {
    const { user } = req.params; // 'justin' | 'emily'
    resolveUser(user); // validates

    const nowEastern = getCurrentTimeInEastern();
    const weekStartMidnight = getWeekStartMidnight();
    const startDate = getStartDateFromEnv();

    // Fetch weekly data
    const weeklyRows = await fetchRescueTimeDataForUser(user, weekStartMidnight, nowEastern);
    const unproductiveMinutes = calculateUnproductiveMinutes(weeklyRows);
    const mostRecentUnproductiveActivity = getMostRecentUnproductiveActivity(weeklyRows);

    // Fetch total data from start date
    const totalRows = await fetchRescueTimeDataForUser(user, startDate, nowEastern);
    const totalUnproductiveMinutes = calculateUnproductiveMinutes(totalRows);

    const UNPRODUCTIVE_THRESHOLD_INCREMENT = 30;
    const expectedImageCount =
      Math.floor(unproductiveMinutes / UNPRODUCTIVE_THRESHOLD_INCREMENT) + 1;

    res.json({
      success: true,
      user,
      unproductiveMinutes: Math.round(unproductiveMinutes * 100) / 100,
      totalUnproductiveMinutes: Math.round(totalUnproductiveMinutes * 100) / 100,
      mostRecentUnproductiveActivity,
      expectedImageCount,
      nextThreshold: expectedImageCount * UNPRODUCTIVE_THRESHOLD_INCREMENT,
      timestamp: nowEastern.toISOString(),
      timezone: "America/New_York",
      weekStart: weekStartMidnight.toISOString(),
      trackingStartDate: startDate.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching current screentime:", error);
    res.status(400).json({
      success: false,
      error: "Failed to fetch current screentime.",
      message: error.message,
    });
  }
});

// --- Export for Vercel ---
export default app;

// --- Start Server (for local development only) ---
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
  });
}
