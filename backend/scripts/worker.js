// worker.js
import "dotenv/config";
import { spawn } from "node:child_process";

function runUser(user) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "node",
      ["lib/generateNano.js", `--user=${user}`, `--reset=${process.env.RESET_MODE || "never"}`],
      { cwd: process.cwd(), stdio: "inherit", env: process.env }
    );
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`[${user}] exit ${code}`))
    );
    proc.on("error", reject);
  });
}

(async function loop() {
  // All supported users
  const users = ["justin", "emily", "lele", "serena", "tiffany"];

  for (;;) {
    const ts = new Date().toISOString();
    console.log(`\n[worker] tick @ ${ts}`);

    const results = await Promise.allSettled(users.map((user) => runUser(user)));

    results.forEach((r, i) => {
      const who = users[i];
      if (r.status === "rejected") {
        console.error(`[worker] ${who} run error:`, r.reason?.message || r.reason);
      }
    });

    await new Promise((r) => setTimeout(r, 60_000));
  }
})();
