const axios = require("axios");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const logMyActivity = async () => {
  console.log("🕒 [Scheduler] Running hourly activity check...");

  try {
    if (!process.env.RESCUETIME_API_KEY) {
      console.error("❌ [Scheduler] Error: RESCUETIME_API_KEY not found.");
      return;
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    const params = {
      key: process.env.RESCUETIME_API_KEY,
      perspective: "interval",
      resolution_time: "minute",
      restrict_begin: startDate,
      restrict_end: endDate,
      restrict_kind: "activity",
      format: "json",
    };

    const response = await axios.get("https://www.rescuetime.com/anapi/data", {
      params,
    });
    const data = response.data;
    const filteredRows = (data.rows || []).filter((row) => {
      const timestamp = new Date(row[0]);
      return timestamp >= oneHourAgo && timestamp <= now;
    });

    if (filteredRows.length === 0) {
      console.log(
        "🕒 [Scheduler] No activity found in the past hour. Skipping log."
      );
      return;
    }

    // --- Data Processing: Get both Summary and Raw Data ---

    // 1. Create the detailed, raw interval log
    const rawIntervals = filteredRows.map((row) => ({
      timestamp: row[0],
      timeSeconds: row[1],
      activity: row[3],
      category: row[4],
      productivity: row[5],
    }));

    // 2. Create the clean, aggregated summary
    const summaryMap = {};
    filteredRows.forEach((row) => {
      const activity = row[3] || "Unknown";
      const timeSpent = row[1] || 0;
      const category = row[4] || "Unknown";
      const productivity = row[5] || 0;

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

    const totalTimeSeconds = filteredRows.reduce(
      (total, row) => total + (row[1] || 0),
      0
    );

    // 3. Combine both into a single result object
    const result = {
      timeRange: { from: oneHourAgo.toISOString(), to: now.toISOString() },
      summary: {
        totalTimeSeconds,
        totalTimeMinutes: Math.round(totalTimeSeconds / 60),
      },
      activitySummary: activitySummary, // The clean, aggregated list
      rawIntervals: rawIntervals, // The detailed, moment-by-moment list
    };

    // --- Save the combined data to a file ---
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
    const filename = `${dateStr}_${timeStr}.json`;
    const dirPath = path.join(__dirname, "activity_logs"); // <-- THIS LINE IS NOW FIXED

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }

    const filePath = path.join(dirPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));

    console.log(
      `✅ [Scheduler] Success! Complete activity data saved to: ${filePath}`
    );
  } catch (error) {
    console.error(
      "❌ [Scheduler] An error occurred while fetching data:",
      error.message
    );
  }
};

// --- The Scheduler ---
const ONE_HOUR_IN_MS = 60 * 60 * 1000;
console.log("🚀 Starting the standalone activity logger.");
console.log(
  `🕒 Logging will occur every hour, saving both summary and raw data.`
);
logMyActivity(); // Run once on startup
setInterval(logMyActivity, ONE_HOUR_IN_MS); // Run every hour thereafter
