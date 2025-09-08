// Load environment variables first
import "./config.js";

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import generateRouter from "./routes/generate.js";
import screentimeRouter from "./routes/screentime.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/generate", generateRouter);
app.use("/activity", screentimeRouter);

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
      "/activity/past-hour": "GET - Fetch activity data from the past hour",
      "/generate/generate-image": "POST - Generate image based on top 4 activities from past hour",
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

export default app;
