const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");

const port = process.env.PORT || "3000";
const host = process.env.TRIMARR_INTERNAL_HOST || "127.0.0.1";
const tickIntervalMs = Number(process.env.TRIMARR_SCHEDULER_INTERVAL_MS || 30000);
const initialDelayMs = Number(process.env.TRIMARR_SCHEDULER_INITIAL_DELAY_MS || 20000);
const token = process.env.TRIMARR_SCHEDULER_TOKEN || randomBytes(24).toString("hex");

let inFlight = false;
let stopped = false;

const child = spawn("node", ["server.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    TRIMARR_SCHEDULER_TOKEN: token,
  },
});

child.on("exit", (code, signal) => {
  stopped = true;
  process.exit(code ?? (signal ? 1 : 0));
});

child.on("error", (error) => {
  console.error("[trimarr-scheduler] failed to start server", error);
  process.exit(1);
});

async function tick() {
  if (stopped || inFlight) {
    return;
  }

  inFlight = true;
  try {
    await fetch(`http://${host}:${port}/api/scheduler/tick`, {
      method: "POST",
      headers: {
        "x-trimarr-scheduler-token": token,
      },
    });
  } catch (error) {
    console.error("[trimarr-scheduler] tick failed", error instanceof Error ? error.message : error);
  } finally {
    inFlight = false;
  }
}

setTimeout(() => {
  if (!stopped) {
    void tick();
  }
}, initialDelayMs);

setInterval(() => {
  if (!stopped) {
    void tick();
  }
}, tickIntervalMs);

function shutdown(signal) {
  stopped = true;
  child.kill(signal);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
