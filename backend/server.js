// server.js

// Load environment variables first
import "./config.js";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "node:fs"; // <-- Add fs
import { fileURLToPath } from "url";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// --- Directories ---
// Assumes server.js is in the root of your backend project
const OUT_DIR = path.join(__dirname, "out");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Static Asset Serving ---
// Make the `/out` directory publicly accessible at the URL /out
// e.g., http://localhost:3000/out/dorian_v001.png
app.use("/out", express.static(OUT_DIR));

// --- API Routes ---

// Health check endpoint (this is good to keep)
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// The NEW endpoint for our frontend viewer
app.get("/api/portrait-history", (req, res) => {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return res.json({ success: true, history: [] }); // Return empty if no runs yet
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    const history = manifest.runs || [];
    res.json({ success: true, history: history.reverse() }); // Newest first
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to read portrait history." });
  }
});

// Root endpoint with updated API information
app.get("/", (req, res) => {
  res.json({
    message: "Dorian Portrait Viewer API",
    version: "2.0.0",
    endpoints: {
      "/api/portrait-history": "GET - Fetch the entire history of portrait generations.",
      "/health": "GET - Health check",
    },
  });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 API Server (the "Waiter") running on port ${PORT}`);
  console.log(`🖼️ Serving images from: ${OUT_DIR}`);
});

export default app;