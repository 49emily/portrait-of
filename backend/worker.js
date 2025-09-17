// worker.js
import "dotenv/config";
import { spawn } from "node:child_process";

function spawnOnce() {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", ["routes/generateNano.js"], {
      cwd: process.cwd(), // Use the current working directory where worker.js was started
      stdio: "inherit",
      env: process.env, // Explicitly pass environment variables
    });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    proc.on("error", reject);
  });
}

(async function loop() {
  for (;;) {
    const ts = new Date().toISOString();
    console.log(`\n[worker] tick @ ${ts}`);
    try {
      await spawnOnce();
    } catch (e) {
      console.error("[worker] run error:", e?.message || e);
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
})();
