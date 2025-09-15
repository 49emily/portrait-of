// worker.js
import "dotenv/config";
import { spawn } from "node:child_process";

function spawnOnce() {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", ["routes/generateNano.js"], {
      cwd: new URL(".", import.meta.url).pathname.replace(/routes\/?$/, ""),
      stdio: "inherit",
    });
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`exit ${code}`))
    );
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
