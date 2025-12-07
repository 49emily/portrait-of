// backend/scripts/calculate-brainrot.js
// Calculate total brainrot (unproductive) time from September 21st until now for each person

import "../config.js";
import axios from "axios";

// User map with RescueTime API keys
const RESCUETIME_KEYS = {
  justin: process.env.RESCUETIME_API_KEY_JUSTIN,
  emily: process.env.RESCUETIME_API_KEY_EMILY,
  lele: process.env.RESCUETIME_API_KEY_LELE,
  serena: process.env.RESCUETIME_API_KEY_SERENA,
  tiffany: process.env.RESCUETIME_API_KEY_TIFFANY,
  isaac: process.env.RESCUETIME_API_KEY_ISAAC,
  //   ameya: process.env.RESCUETIME_API_KEY_AMEYA,
};

const USERS = Object.keys(RESCUETIME_KEYS);

// Start date: September 21, 2025
const START_DATE = new Date("2025-09-21T00:00:00-04:00");
const END_DATE = new Date(); // Now

/**
 * Fetch RescueTime data for a specific user and date range
 */
async function fetchRescueTimeDataForUser(user, apiKey, startDate, endDate) {
  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  const params = {
    key: apiKey,
    perspective: "interval",
    resolution_time: "day", // Use daily resolution for large date ranges
    restrict_begin: startDateStr,
    restrict_end: endDateStr,
    restrict_kind: "productivity",
    format: "json",
  };

  try {
    console.log(`  📡 Fetching data for ${user} (${startDateStr} to ${endDateStr})...`);
    const response = await axios.get("https://www.rescuetime.com/anapi/data", {
      params,
    });
    return response.data.rows || [];
  } catch (error) {
    console.error(`  ❌ RescueTime API Error for ${user}:`, error.response?.data || error.message);
    return [];
  }
}

/**
 * Calculate total unproductive (brainrot) minutes from rows
 * RescueTime row format: [date, time_seconds, people, productivity_score]
 * Productivity scores: -2 (very distracting) and -1 (distracting)
 */
function calculateBrainrotMinutes(rows) {
  const brainrotSeconds = rows
    .filter((row) => row[3] < 0) // Productivity score < 0
    .reduce((total, row) => total + (row[1] || 0), 0);
  return brainrotSeconds / 60;
}

/**
 * Format minutes into a human-readable string
 */
function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days > 0) {
    return `${days}d ${remainingHours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h ${mins}m`;
  } else {
    return `${mins}m`;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("\n🧠 BRAINROT TIME CALCULATOR 🧠");
  console.log("=".repeat(60));
  console.log(`📅 Period: September 21, 2025 - ${END_DATE.toLocaleDateString()}`);
  console.log(
    `⏱️  Duration: ${Math.round((END_DATE - START_DATE) / (1000 * 60 * 60 * 24))} days (11 weeks)`
  );
  console.log("=".repeat(60));
  console.log();

  const results = [];

  for (const user of USERS) {
    const apiKey = RESCUETIME_KEYS[user];

    if (!apiKey) {
      console.log(`⚠️  ${user.toUpperCase()}: No API key found - SKIPPED`);
      console.log();
      continue;
    }

    console.log(`🔍 Processing ${user.toUpperCase()}...`);

    const rows = await fetchRescueTimeDataForUser(user, apiKey, START_DATE, END_DATE);
    const brainrotMinutes = calculateBrainrotMinutes(rows);

    results.push({
      user,
      minutes: brainrotMinutes,
      hours: brainrotMinutes / 60,
      formatted: formatMinutes(brainrotMinutes),
    });

    console.log(
      `  ✅ Total brainrot: ${formatMinutes(brainrotMinutes)} (${brainrotMinutes.toFixed(
        0
      )} minutes)`
    );
    console.log();
  }

  // Sort by brainrot time (descending)
  results.sort((a, b) => b.minutes - a.minutes);

  // Display summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY (Ranked by Brainrot Time)");
  console.log("=".repeat(60));
  console.log();

  const maxNameLength = Math.max(...results.map((r) => r.user.length));

  results.forEach((result, index) => {
    const rank = `${index + 1}.`.padEnd(3);
    const name = result.user.toUpperCase().padEnd(maxNameLength + 2);
    const time = result.formatted.padEnd(15);
    const hours = `(${result.hours.toFixed(1)} hours)`;

    console.log(`${rank} ${name} ${time} ${hours}`);
  });

  console.log();
  console.log("=".repeat(60));

  // Calculate total and average
  const totalMinutes = results.reduce((sum, r) => sum + r.minutes, 0);
  const avgMinutes = totalMinutes / results.length;

  console.log(`📈 Total brainrot across all users: ${formatMinutes(totalMinutes)}`);
  console.log(`📊 Average brainrot per user: ${formatMinutes(avgMinutes)}`);
  console.log("=".repeat(60));
  console.log();
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
