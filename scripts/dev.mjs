import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = ["dev:server", "dev:web"].map((script) => spawn(npm, ["run", script], {
  stdio: "inherit",
}));
let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill(signal);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (stopping) return;
    process.exitCode = code ?? (signal ? 1 : 0);
    stop();
  });
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
