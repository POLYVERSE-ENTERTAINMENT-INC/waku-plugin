#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const templateDir = path.join(pluginRoot, "templates", "session-react");
const args = process.argv.slice(2);

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function usage() {
  console.error("Usage: node scripts/waku-copy-template.mjs <destination> [--force]");
}

const destinationArg = args.find((arg) => !arg.startsWith("--"));
const force = args.includes("--force");
if (!destinationArg) {
  usage();
  process.exit(2);
}

const destination = path.resolve(destinationArg);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`BLOCKED_TEMPLATE_UNAVAILABLE: cannot read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertBundledTemplate() {
  const metaPath = path.join(templateDir, "template.json");
  if (!fs.existsSync(metaPath)) {
    fail(`BLOCKED_TEMPLATE_UNAVAILABLE: bundled template metadata missing at ${metaPath}`);
  }
  const meta = readJson(metaPath);
  for (const relativePath of meta.requiredFiles ?? []) {
    const filePath = path.join(templateDir, relativePath);
    if (!fs.existsSync(filePath)) {
      fail(`BLOCKED_TEMPLATE_UNAVAILABLE: bundled template missing required file ${relativePath}`);
    }
  }
  const css = fs.readFileSync(path.join(templateDir, "src", "index.css"), "utf8");
  if (!/--safe-top\s*:\s*calc\(\s*var\(--runtime-safe-top\)\s*\+\s*var\(--waku-top-chrome\)\s*\)/.test(css)) {
    fail("BLOCKED_TEMPLATE_UNAVAILABLE: bundled template safe-top formula is not the official additive safe-area contract");
  }
  return meta;
}

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "public") continue;
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

const meta = assertBundledTemplate();

if (fs.existsSync(destination)) {
  const entries = fs.readdirSync(destination).filter((name) => name !== ".DS_Store");
  if (entries.length > 0 && !force) {
    fail(`Destination is not empty: ${destination}. Choose a new directory or pass --force.`);
  }
} else {
  fs.mkdirSync(destination, { recursive: true });
}

copyDir(templateDir, destination);
console.log(JSON.stringify({ ok: true, destination, template: { id: meta.id, version: meta.version, source: "bundled" } }, null, 2));
