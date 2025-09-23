// server.js

// Load environment variables first
import "./config.js";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import { resolveUser, getPortraitHistory } from "./controllers/supabase.js";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ---- User map to pick the right RescueTime API key ----
const RESCUETIME_KEYS = {
  justin: process.env.RESCUETIME_API_KEY_JUSTIN,
  emily: process.env.RESCUETIME_API_KEY_EMILY,
};

// --- Utils ---
function getTodayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

async function fetchRescueTimeDataForUser(user, startTime, endTime) {
  const apiKey = RESCUETIME_KEYS[user];
  if (!apiKey) throw new Error(`Missing RescueTime key for ${user}`);

  // Pull a larger range and then filter locally to the minute
  const startDate = new Date(startTime.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
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
    console.error(
      `❌ RescueTime API Error (${user}):`,
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
      "/api/justin/current-screentime":
        "Justin's current unproductive minutes + thresholds",
      "/api/emily/portrait-history": "Emily's generations",
      "/api/emily/current-screentime":
        "Emily's current unproductive minutes + thresholds",
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

app.get("/api/:user/current-screentime", async (req, res) => {
  try {
    const { user } = req.params; // 'justin' | 'emily'
    resolveUser(user); // validates

    const now = new Date();
    const todayMidnight = getTodayMidnight();
    const rows = await fetchRescueTimeDataForUser(user, todayMidnight, now);
    const unproductiveMinutes = calculateUnproductiveMinutes(rows);

    const UNPRODUCTIVE_THRESHOLD_INCREMENT = 30;
    const expectedImageCount =
      Math.floor(unproductiveMinutes / UNPRODUCTIVE_THRESHOLD_INCREMENT) + 1;

    res.json({
      success: true,
      user,
      unproductiveMinutes: Math.round(unproductiveMinutes * 100) / 100,
      expectedImageCount,
      nextThreshold: expectedImageCount * UNPRODUCTIVE_THRESHOLD_INCREMENT,
      timestamp: now.toISOString(),
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

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
});

export default app;
