#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const projectDir = path.resolve(flag("--project-dir", process.cwd()));
const siteDir = path.resolve(projectDir, flag("--site-dir", "public"));
const screenshot = path.resolve(projectDir, flag("--screenshot", "waku-visual-check.png"));
const visualReport = path.resolve(projectDir, flag("--visual-report", "waku-visual-report.json"));
const pluginRoot = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const visualCheck = path.join(pluginRoot, "scripts", "waku-visual-check.mjs");

if (!fs.existsSync(path.join(projectDir, "package.json"))) {
  die(`Missing package.json in ${projectDir}. Waku create must scaffold the bundled session template first.`);
}

if (!fs.existsSync(visualCheck)) {
  die(`Missing visual gate script: ${visualCheck}`);
}

console.error("[waku-create-gate] running npm run test...");
run("npm", ["run", "test"], projectDir);

console.error("[waku-create-gate] running mobile visual host-chrome gate...");
run(process.execPath, [visualCheck, "--site-dir", siteDir, "--screenshot", screenshot, "--report", visualReport], projectDir);

console.log(JSON.stringify({
  ok: true,
  projectDir,
  siteDir,
  screenshot,
  visualReport,
}, null, 2));

function flag(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function die(message) {
  console.error(`[waku-create-gate] ${message}`);
  process.exit(1);
}
