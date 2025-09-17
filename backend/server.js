// server.js

// Load environment variables first
import "./config.js";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "node:fs"; // <-- Add fs
import { fileURLToPath } from "url";
import { getAllPortraitHistory } from "./controllers/supabase.js";
import axios from "axios";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// --- Directories ---

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Helper Functions ---

// Get midnight of current day
function getTodayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Fetch RescueTime data (copied from generateNano.js)
async function fetchRescueTimeData(startTime, endTime) {
  if (!process.env.RESCUETIME_API_KEY) {
    throw new Error("RESCUETIME_API_KEY missing in .env");
  }

  // Set restrict_begin/end to full days to ensure we capture all possible data
  const startDate = new Date(startTime.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const endDate = endTime.toISOString().split("T")[0];

  const params = {
    key: process.env.RESCUETIME_API_KEY,
    perspective: "interval",
    resolution_time: "minute",
    restrict_begin: startDate,
    restrict_end: endDate,
    restrict_kind: "activity",
    format: "json",
  };

  try {
    const response = await axios.get("https://www.rescuetime.com/anapi/data", { params });
    const allRows = response.data.rows || [];

    // Filter data to only include the specified time range
    const filteredRows = allRows.filter((row) => {
      const timestamp = new Date(row[0]);
      return timestamp >= startTime && timestamp <= endTime;
    });

    return filteredRows;
  } catch (error) {
    console.error("❌ RescueTime API Error:", error.response?.data || error.message);
    return [];
  }
}

// Calculate unproductive minutes
function calculateUnproductiveMinutes(rows) {
  const unproductiveSeconds = rows
    .filter((row) => row[5] < 0) // row[5] is the productivity score
    .reduce((total, row) => total + (row[1] || 0), 0); // row[1] is time in seconds

  return unproductiveSeconds / 60;
}

// --- API Routes ---

// Health check endpoint (this is good to keep)
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// The NEW endpoint for our frontend viewer - now using Supabase
app.get("/api/portrait-history", async (req, res) => {
  try {
    const history = await getAllPortraitHistory();
    res.json({ success: true, history }); // Already ordered newest first
  } catch (error) {
    console.error("Error fetching portrait history from Supabase:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch portrait history from Supabase.",
      message: error.message,
    });
  }
});

// New endpoint to get current unproductive screentime for progress bar
app.get("/api/current-screentime", async (req, res) => {
  try {
    const now = new Date();
    const todayMidnight = getTodayMidnight();
    const rows = await fetchRescueTimeData(todayMidnight, now);
    const unproductiveMinutes = calculateUnproductiveMinutes(rows);

    // Calculate how many images should have been generated
    const expectedImageCount = Math.floor(unproductiveMinutes / 30) + 1;

    res.json({
      success: true,
      unproductiveMinutes: Math.round(unproductiveMinutes * 100) / 100, // Round to 2 decimal places
      expectedImageCount,
      nextThreshold: expectedImageCount * 30,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching current screentime:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch current screentime.",
      message: error.message,
    });
  }
});

// Root endpoint with updated API information
app.get("/", (req, res) => {
  res.json({
    message: "Dorian Portrait Viewer API",
    version: "2.0.0",
    endpoints: {
      "/api/portrait-history": "GET - Fetch the entire history of portrait generations.",
      "/api/current-screentime": "GET - Get current unproductive screentime for today.",
      "/health": "GET - Health check",
    },
  });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 API Server (the "Waiter") running on port ${PORT}`);
});

export default app;
