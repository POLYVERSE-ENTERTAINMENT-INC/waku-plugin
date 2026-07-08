#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageRoot = path.join(root, "plugins", "waku");

const scanRoots = [
  { label: "packaged plugin", dir: packageRoot, exclude: [] },
  { label: "root plugin sources", dir: root, exclude: [packageRoot] },
];

const skippedDirs = new Set([
  ".git",
  ".vs",
  "Library",
  "node_modules",
  "obj",
  "public",
  "dist",
]);

const skippedFiles = new Set([
  "package-lock.json",
]);

const allowedUrlPatterns = [
  // The launcher is intentionally public: users must be able to download the CLI.
  /https:\/\/storage\.googleapis\.com\/samantha-app-pv-samantha-site-artifacts-asia-east1\/waku-cli\/install\.sh/g,
];

const forbiddenPatterns = [
  {
    name: "business backend host",
    pattern: /\bhttps?:\/\/(?:waku-core-api|waku-playground|polyverse-samantha(?:-dev)?-(?:api|web|ai-capability))[^"'\s)]+/gi,
  },
  {
    name: "hard-coded api_base/web_base URL",
    pattern: /\b(?:api_base|web_base|apiBase|webBase)\b\s*[:=]\s*["']https?:\/\/[^"']+["']/gi,
  },
  {
    name: "hard-coded MCP HTTP endpoint",
    pattern: /\b(?:mcp_url|mcpUrl|MCP_URL)\b\s*[:=]\s*["']https?:\/\/[^"']+["']/g,
  },
  {
    name: "saved session token value",
    pattern: /\b(?:session_token|refresh_token|mcp_token)\b\s*[:=]\s*["'][A-Za-z0-9._~+/=-]{24,}["']/g,
  },
  {
    name: "literal bearer credential",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/g,
  },
];

const failures = [];

for (const rootSpec of scanRoots) {
  if (!fs.existsSync(rootSpec.dir)) continue;
  for (const filePath of listTextFiles(rootSpec.dir, rootSpec.exclude)) {
    const relativePath = toPosix(path.relative(root, filePath));
    const text = stripAllowedUrls(fs.readFileSync(filePath, "utf8"));
    for (const rule of forbiddenPatterns) {
      const matches = [...text.matchAll(rule.pattern)];
      for (const match of matches) {
        failures.push({
          rule: rule.name,
          file: relativePath,
          line: lineNumber(text, match.index ?? 0),
          match: abbreviate(match[0]),
        });
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Waku plugin exposure check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line} ${failure.rule}: ${failure.match}`);
  }
  console.error("");
  console.error("Keep business backend URLs and saved credentials out of the plugin package.");
  console.error("Authenticated network operations should flow through the installed Waku CLI.");
  process.exit(1);
}

console.log("Waku plugin exposure check passed.");

function listTextFiles(dir, excludedRoots = []) {
  const files = [];
  walk(dir);
  return files;

  function walk(currentDir) {
    if (excludedRoots.some((excludedRoot) => path.resolve(currentDir) === path.resolve(excludedRoot))) {
      return;
    }
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skippedDirs.has(entry.name)) {
          walk(path.join(currentDir, entry.name));
        }
        continue;
      }

      if (!entry.isFile() || skippedFiles.has(entry.name)) continue;

      const filePath = path.join(currentDir, entry.name);
      if (isProbablyText(filePath)) files.push(filePath);
    }
  }
}

function isProbablyText(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) return false;
  const extension = path.extname(filePath).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".gz", ".tgz", ".wasm"].includes(extension)) {
    return false;
  }
  return true;
}

function stripAllowedUrls(text) {
  let result = text;
  for (const pattern of allowedUrlPatterns) {
    result = result.replace(pattern, "[ALLOWED_WAKU_CLI_INSTALL_URL]");
  }
  return result;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function abbreviate(value) {
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
