import "dotenv/config";
import axios from "axios";

// This script is a simple utility to check the RescueTime API for recent activity.
// It helps diagnose if an empty response is due to the free plan's sync delay
// or another issue like the agent not running.

const checkRescueTime = async () => {
  // --- CONFIGURATION ---
  const apiKey = process.env.RESCUETIME_API_KEY;
  const apiUrl = "https://www.rescuetime.com/anapi/data";

  // Get minutes from command line argument, or default to 60
  const minutesToCheck = parseInt(process.argv[2], 10) || 60;
  console.log(`\n🔎 Checking RescueTime for activity in the last ${minutesToCheck} minutes...`);

  if (!apiKey) {
    console.error("❌ Error: RESCUETIME_API_KEY not found in your .env file.");
    return;
  }

  // --- API CALL ---
  const now = new Date();
  const startTime = new Date(now.getTime() - minutesToCheck * 60 * 1000);

  const params = {
    key: apiKey,
    perspective: "interval",
    resolution_time: "minute", // Get the most granular data (5-min buckets)
    restrict_begin: startTime.toISOString(),
    restrict_end: now.toISOString(),
    restrict_kind: "activity",
    format: "json",
  };

  try {
    const response = await axios.get(apiUrl, { params });
    const rows = response.data.rows || [];

    // --- DISPLAY RESULTS ---
    if (rows.length === 0) {
      console.log("\n🟡 Result: No data found for the last " + minutesToCheck + " minutes.");
      console.log("   This is common with the free plan's 30-minute sync delay.");
      console.log("   Suggestions:");
      console.log("   1. Ensure the RescueTime desktop app is running and logged in.");
      console.log("   2. Be active on your computer for a while, then wait 30-40 minutes before running this check again.");
    } else {
      console.log(`\n✅ Success! Found ${rows.length} activity records:`);
      console.log("-----------------------------------------------------------------");
      console.log("Timestamp             | Secs | Prod | Activity");
      console.log("-----------------------------------------------------------------");
      rows.forEach(row => {
        const timestamp = new Date(row[0]).toLocaleTimeString();
        const seconds = String(row[1]).padEnd(4);
        const productivity = String(row[5]).padEnd(4);
        const activity = row[3];
        console.log(`${timestamp.padEnd(21)} | ${seconds} | ${productivity} | ${activity}`);
      });
      console.log("-----------------------------------------------------------------");
    }
  } catch (error) {
    console.error("\n❌ An error occurred while calling the RescueTime API:");
    console.error(error.response?.data || error.message);
  }
};

checkRescueTime();