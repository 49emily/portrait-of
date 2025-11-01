// backend/api/cron.js - Vercel cron job endpoint
import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory of this file and resolve the lib path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const libPath = path.resolve(__dirname, "../lib/generateNano.js");

function runUser(user) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "node",
      [libPath, `--user=${user}`, `--reset=${process.env.RESET_MODE || "never"}`],
      {
        cwd: process.cwd(),
        stdio: "pipe", // Changed from "inherit" to capture output
        env: process.env,
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ user, stdout, stderr });
      } else {
        reject(new Error(`[${user}] exit ${code}: ${stderr}`));
      }
    });

    proc.on("error", reject);
  });
}

export default async function handler(req, res) {
  // Verify this is a cron request (optional security check)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ts = new Date().toISOString();
  console.log(`\n[cron] tick @ ${ts}`);

  try {
    // Run for all users
    const allUsers = ["justin", "emily", "lele", "serena", "tiffany", "isaac", "ameya"];
    const results = await Promise.allSettled(allUsers.map((user) => runUser(user)));

    const response = {
      timestamp: ts,
      results: [],
    };

    results.forEach((r, i) => {
      const who = allUsers[i];
      if (r.status === "fulfilled") {
        console.log(`[cron] ${who} run completed successfully`);
        response.results.push({
          user: who,
          status: "success",
          output: r.value.stdout,
        });
      } else {
        console.error(`[cron] ${who} run error:`, r.reason?.message || r.reason);
        response.results.push({
          user: who,
          status: "error",
          error: r.reason?.message || r.reason.toString(),
        });
      }
    });

    res.status(200).json(response);
  } catch (error) {
    console.error("[cron] Unexpected error:", error);
    res.status(500).json({
      timestamp: ts,
      error: "Internal server error",
      message: error.message,
    });
  }
}
