const express = require("express");
const axios = require("axios");
const cors = require("cors");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = 3000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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
    startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0],
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

// Endpoint to generate image based on top activities
app.post("/api/generate-image", async (req, res) => {
  try {
    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.",
      });
    }

    // Get activities from request body
    const { activities } = req.body;

    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({
        error: "No activities provided",
        message: "Please provide an array of activities in the request body.",
      });
    }

    // Get top 4 activities
    const top4Activities = activities.slice(0, 4);

    // Format activities for the prompt
    const activityDescriptions = top4Activities
      .map((activity, index) => {
        return `${index + 1}. ${activity.activity} (${activity.category}) - ${
          activity.totalTimeMinutes
        } minutes`;
      })
      .join("\n");

    const prompt = `Given a list of my highest screen time activities, give me a prompt for a portrait that represents an activity. You can choose one of the activities provided, preferably the first one, which has the most screen time, but choose whichever you can come up with the most vivid and interesting painting for.

Also, based on the activity, its category, and its productivity level, describe the overall mood of the painting as something light, vibrant, and sunny or dark, depressed, or sinister. Examples of productive activities are coding, reading, learning, working, and writing. Examples of unproductive activities are shopping, browsing social media, and watching videos.

Here are some examples of the activities and their prompts:

Activity/Activities: "nytimes.com" (News)
Prompt: "Show this person in a chair reading the newspaper, drinking tea, in an oil painting style with lots of light."

Activity/Activities: "aritzia.com" (General Shopping), "nordstrom.com" (General Shopping), "amazon.com" (General Shopping)
Prompt: "Show this person with lots of shopping bags and money being spent everywhere, dark oil painting style."

Activity/Activities: "Cursor (Editing & IDEs), Github.com (General Software Development)"
Prompt: "Show this person typing at their computer, thinking hard, with the green github grid as the background. oil painting style, light and sunny."

Activity/Activities: "x.com" (Social Media)
Prompt: "Show this person scrolling through social media on their phone, surrounded by notifications and distractions, in a dark moody style."

My activities: ${activityDescriptions}

Please provide only the prompt for the image generation, nothing else.`;
    const prompt_response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const image_prompt = prompt_response.choices[0].message.content;

    console.log("Prompt:", image_prompt);

    //     // Create a prompt for image generation
    //     const prompt = `Create a creative and artistic visualization representing a person's digital activity from the past hour. The top activities were:

    // ${activityDescriptions}

    // Create an abstract, colorful, and engaging image that represents this digital workflow and productivity. Use modern, clean design elements with vibrant colors. The image should feel inspiring and represent the balance of different digital activities.`;

    // console.log("Generating image with prompt:", prompt);

    // Read and encode the reference image
    const imagePath = path.join(__dirname, "data", "emily2.jpg");
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64Reference = imageBuffer.toString("base64");

    // Generate image using OpenAI GPT-4.1 with responses API
    const response = await openai.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: image_prompt },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${imageBase64Reference}`,
            },
          ],
        },
      ],
      tools: [{ type: "image_generation" }],
    });

    const imageData = response.output
      .filter((output) => output.type === "image_generation_call")
      .map((output) => output.result);

    if (!imageData || imageData.length === 0) {
      throw new Error("No image data returned from OpenAI");
    }

    // Convert base64 to data URL for frontend display
    const imageBase64 = imageData[0];
    const imageUrl = `data:image/png;base64,${imageBase64}`;

    // Return success response
    res.json({
      success: true,
      imageUrl: imageUrl,
      activities: top4Activities,
      prompt: image_prompt,
    });
  } catch (error) {
    console.error("Error generating image:", error.message);

    if (error.response) {
      // API responded with error status
      res.status(error.response.status).json({
        error: "API error",
        message: error.response.data?.error?.message || error.message,
        status: error.response.status,
      });
    } else if (error.request) {
      // Network error
      res.status(503).json({
        error: "Network error",
        message: "Unable to reach the API. Please check your connection and try again.",
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
      "/api/generate-image": "POST - Generate image based on top 4 activities from past hour",
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
