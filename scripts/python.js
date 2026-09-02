#!/usr/bin/env node
// Resolve and run the project's venv Python interpreter regardless of OS.
// npm scripts can't branch on platform, so this tiny launcher does.
//   node scripts/python.js -m uvicorn main:app ...
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const isWin = process.platform === "win32";
const venvBin = isWin ? "Scripts" : "bin";
const pythonName = isWin ? "python.exe" : "python";

const candidates = [
  path.join(__dirname, "..", ".venv", venvBin, pythonName),
];

const exe = candidates.find((c) => {
  try {
    require("node:fs").accessSync(c);
    return true;
  } catch {
    return false;
  }
});

if (!exe) {
  console.error(
    `[scripts/python.js] No venv interpreter found (looked for ${candidates.join(", ")}).\n` +
      "Create it first, e.g.  python -m venv .venv"
  );
  process.exit(1);
}

const result = spawnSync(exe, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);