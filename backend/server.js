const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to get date in YYYY-MM-DD format
const getDateString = (date) => {
  return date.toISOString().split("T")[0];
};

// Helper function to get time range for the past hour
const getPastHourRange = () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // Exactly 1 hour ago

  return {
    start: oneHourAgo,
    end: now,
    // For API calls - be conservative and ensure we capture all possible data
    // Since restrict_begin/end are date-only (start at 00:00), we need full day coverage
    // Use the day before oneHourAgo to ensure we don't miss any data
    startDate: new Date(oneHourAgo.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
  };
};

// Endpoint to fetch activity data from the past hour
app.get("/api/activity/past-hour", async (req, res) => {
  try {
    // Validate API key
    if (!process.env.RESCUETIME_API_KEY) {
      return res.status(500).json({
        error:
          "RescueTime API key not configured. Please set RESCUETIME_API_KEY in your .env file.",
      });
    }

    // Get time range for the past hour
    const timeRange = getPastHourRange();

    // RescueTime API parameters - optimized for minimal data transfer
    // Note: RescueTime API only supports date-level filtering, not hour-level
    // So we request the minimal date range and filter precisely on our end
    const params = {
      key: process.env.RESCUETIME_API_KEY,
      perspective: "interval",
      resolution_time: "minute", // 5-minute buckets for precise time filtering
      restrict_begin: timeRange.startDate,
      restrict_end: timeRange.endDate,
      restrict_kind: "activity", // Individual activities (most detailed level)
      format: "json",
    };

    // Make request to RescueTime API
    const response = await axios.get("https://www.rescuetime.com/anapi/data", { params });

    if (response.status !== 200) {
      throw new Error(`RescueTime API returned status ${response.status}`);
    }

    const data = response.data;

    // Filter data to only include the past hour
    // RescueTime returns data with timestamps, we need to filter for the exact past hour
    let filteredRows = [];

    if (data.rows && Array.isArray(data.rows)) {
      filteredRows = data.rows.filter((row) => {
        // Row structure: [Date, Time Spent (seconds), Number of People, Activity, Category, Productivity]
        // The first element is the timestamp in format "2024-01-01 14:05:00"
        const timestamp = new Date(row[0]);
        return timestamp >= timeRange.start && timestamp <= timeRange.end;
      });
    }

    // Calculate total time for the past hour
    const totalTimeSeconds = filteredRows.reduce((total, row) => {
      return total + (row[1] || 0); // row[1] is time spent in seconds
    }, 0);

    // Group activities by name and sum their time
    const activitySummary = {};
    filteredRows.forEach((row) => {
      const activity = row[3] || "Unknown"; // row[3] is activity name
      const timeSpent = row[1] || 0; // row[1] is time spent in seconds
      const category = row[4] || "Unknown"; // row[4] is category
      const productivity = row[5] || 0; // row[5] is productivity score

      if (!activitySummary[activity]) {
        activitySummary[activity] = {
          activity,
          category,
          totalTimeSeconds: 0,
          totalTimeMinutes: 0,
          productivity,
          occurrences: 0,
        };
      }

      activitySummary[activity].totalTimeSeconds += timeSpent;
      activitySummary[activity].totalTimeMinutes = Math.round(
        activitySummary[activity].totalTimeSeconds / 60
      );
      activitySummary[activity].occurrences += 1;
    });

    // Convert to array and sort by time spent
    const sortedActivities = Object.values(activitySummary).sort(
      (a, b) => b.totalTimeSeconds - a.totalTimeSeconds
    );

    // Prepare response
    const result = {
      success: true,
      timeRange: {
        from: timeRange.start.toISOString(),
        to: timeRange.end.toISOString(),
        description: "Past hour activity data",
      },
      summary: {
        totalTimeSeconds,
        totalTimeMinutes: Math.round(totalTimeSeconds / 60),
        totalActivities: sortedActivities.length,
        dataPoints: filteredRows.length,
      },
      activities: sortedActivities,
      rawData: {
        notes: data.notes,
        row_headers: data.row_headers,
        filtered_rows: filteredRows,
      },
    };

    res.json(result);
  } catch (error) {
    console.error("Error fetching RescueTime data:", error.message);

    if (error.response) {
      // API responded with error status
      res.status(error.response.status).json({
        error: "RescueTime API error",
        message: error.response.data || error.message,
        status: error.response.status,
      });
    } else if (error.request) {
      // Network error
      res.status(503).json({
        error: "Unable to reach RescueTime API",
        message: "Please check your internet connection and try again",
      });
    } else {
      // Other error
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Dorian RescueTime Backend",
  });
});

// Root endpoint with API information
app.get("/", (req, res) => {
  res.json({
    message: "Dorian RescueTime Backend API",
    version: "1.0.0",
    endpoints: {
      "/api/activity/past-hour": "GET - Fetch activity data from the past hour",
      "/health": "GET - Health check",
    },
    documentation: {
      pastHour: {
        description: "Returns detailed activity data for the past hour",
        response: {
          timeRange: "Object with from/to timestamps",
          summary: "Aggregated statistics",
          activities: "Array of activities sorted by time spent",
          rawData: "Original RescueTime API response data",
        },
      },
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Dorian RescueTime Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`⏰ Past hour data: http://localhost:${PORT}/api/activity/past-hour`);

  if (!process.env.RESCUETIME_API_KEY) {
    console.warn("⚠️  Warning: RESCUETIME_API_KEY not set in environment variables");
    console.log(
      "📝 Please create a .env file based on env.template and add your RescueTime API key"
    );
  }
});

module.exports = app;
