const axios = require("axios");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// --- CONFIGURATION ---
// Centralized configuration for easy changes.
const CONFIG = {
  API_KEY: process.env.RESCUETIME_API_KEY,
  API_URL: "https://www.rescuetime.com/anapi/data",
  LOG_DIRECTORY: path.join(__dirname, "activity_logs"),
  INTERVAL_MS: 60 * 60 * 1000, // 1 hour
};

// --- 1. FETCHER ---
// Responsible only for fetching data from the RescueTime API.
const fetchActivityData = async (startTime, endTime) => {
  console.log("📡 [Fetcher] Fetching data from RescueTime API...");
  const params = {
    key: CONFIG.API_KEY,
    perspective: "interval",
    resolution_time: "minute",
    restrict_begin: startTime.toISOString(), // More efficient: only request the last hour
    restrict_end: endTime.toISOString(),
    restrict_kind: "activity",
    format: "json",
  };

  const response = await axios.get(CONFIG.API_URL, { params });
  return response.data.rows || [];
};

// --- 2. PROCESSOR ---
// Responsible for transforming the raw API data into our desired format.
const processApiData = (rows) => {
  console.log("⚙️ [Processor] Processing raw activity data...");

  // Create the detailed, raw interval log
  const rawIntervals = rows.map((row) => ({
    timestamp: row[0],
    timeSeconds: row[1],
    activity: row[3],
    category: row[4],
    productivity: row[5],
  }));

  // Create the clean, aggregated summary
  const summaryMap = {};
  rows.forEach(([timestamp, timeSpent, people, activity, category, productivity]) => {
    if (!summaryMap[activity]) {
      summaryMap[activity] = {
        activity,
        category,
        totalTimeSeconds: 0,
        productivity,
      };
    }
    summaryMap[activity].totalTimeSeconds += timeSpent;
  });

  const activitySummary = Object.values(summaryMap).sort(
    (a, b) => b.totalTimeSeconds - a.totalTimeSeconds
  );

  const totalTimeSeconds = rows.reduce((total, row) => total + (row[1] || 0), 0);

  return {
    summary: {
      totalTimeSeconds,
      totalTimeMinutes: Math.round(totalTimeSeconds / 60),
    },
    activitySummary,
    rawIntervals,
  };
};

// --- 3. SAVER ---
// Responsible only for saving the processed data to a file.
const saveActivityLog = (logData) => {
  const dateStr = new Date(logData.timeRange.to).toISOString().split("T")[0];
  const timeStr = new Date(logData.timeRange.to).toTimeString().split(" ")[0].replace(/:/g, "-");
  const filename = `${dateStr}_${timeStr}.json`;
  const filePath = path.join(CONFIG.LOG_DIRECTORY, filename);

  console.log(`💾 [Saver] Saving activity log to: ${filePath}`);

  if (!fs.existsSync(CONFIG.LOG_DIRECTORY)) {
    fs.mkdirSync(CONFIG.LOG_DIRECTORY, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(logData, null, 2));
  return filePath;
};

// --- 4. ORCHESTRATOR ---
// The main function that coordinates fetching, processing, and saving.
const logMyActivity = async () => {
  console.log("🕒 [Scheduler] Running hourly activity check...");

  if (!CONFIG.API_KEY) {
    console.error("❌ [Scheduler] Error: RESCUETIME_API_KEY not found in .env file.");
    return;
  }

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - CONFIG.INTERVAL_MS);

    const rows = await fetchActivityData(oneHourAgo, now);

    if (rows.length === 0) {
      console.log("🕒 [Scheduler] No activity found in the past hour. Skipping log.");
      return;
    }

    const processedData = processApiData(rows);
    
    const finalLog = {
      timeRange: { from: oneHourAgo.toISOString(), to: now.toISOString() },
      ...processedData,
    };

    const savedFilePath = await saveActivityLog(finalLog);
    console.log(`✅ [Scheduler] Success! Data saved to: ${savedFilePath}`);

  } catch (error) {
    let errorMessage = "An unknown error occurred.";
    if (error.isAxiosError) {
      errorMessage = `API Error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`;
    } else {
      errorMessage = error.message;
    }
    console.error("❌ [Scheduler] An error occurred while running the task:", errorMessage);
  }
};

// --- 5. SCHEDULER ---
// A more robust scheduler that waits for the previous run to finish.
const runScheduler = async () => {
  await logMyActivity(); // Run the task
  // After the task is complete (or has failed), schedule the next one.
  setTimeout(runScheduler, CONFIG.INTERVAL_MS);
};

console.log("🚀 Starting the standalone activity logger.");
console.log(`🕒 Logging will occur every hour.`);
runScheduler(); // Start the scheduler loop