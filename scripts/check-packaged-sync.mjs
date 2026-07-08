#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageRoot = path.join(root, "plugins", "waku");

const syncTargets = [
  { source: "bin/waku", packaged: "bin/waku", type: "file" },
  { source: "skills", packaged: "skills", type: "dir" },
  { source: "templates", packaged: "templates", type: "dir" },
  {
    source: "scripts",
    packaged: "scripts",
    type: "dir",
    include: (relativePath) => /^waku-.*\.mjs$/.test(relativePath),
  },
];

const failures = [];

validateMcpConfigs();
validateNoBackendExposure();

for (const target of syncTargets) {
  const sourcePath = path.join(root, target.source);
  const packagedPath = path.join(packageRoot, target.packaged);

  if (target.type === "file") {
    compareFile(target.source, sourcePath, packagedPath);
    continue;
  }

  compareDir(target, sourcePath, packagedPath);
}

if (failures.length > 0) {
  console.error("Packaged Waku plugin is out of sync:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error("");
  console.error("Copy the root source files into plugins/waku, then rerun:");
  console.error("  node scripts/check-packaged-sync.mjs");
  process.exit(1);
}

console.log("Packaged Waku plugin sync check passed.");

function compareDir(target, sourcePath, packagedPath) {
  if (!fs.existsSync(sourcePath)) {
    failures.push(`missing source directory: ${target.source}`);
    return;
  }
  if (!fs.existsSync(packagedPath)) {
    failures.push(`missing packaged directory: plugins/waku/${target.packaged}`);
    return;
  }

  const sourceFiles = listFiles(sourcePath, target.include);
  const packagedFiles = listFiles(packagedPath, target.include);
  const allFiles = new Set([...sourceFiles, ...packagedFiles]);

  for (const relativePath of [...allFiles].sort()) {
    const sourceFile = path.join(sourcePath, relativePath);
    const packagedFile = path.join(packagedPath, relativePath);
    const label = path.posix.join(target.source, toPosix(relativePath));
    compareFile(label, sourceFile, packagedFile);
  }
}

function compareFile(label, sourceFile, packagedFile) {
  const sourceExists = fs.existsSync(sourceFile);
  const packagedExists = fs.existsSync(packagedFile);
  if (!sourceExists || !packagedExists) {
    if (!sourceExists) failures.push(`missing source file: ${label}`);
    if (!packagedExists) failures.push(`missing packaged file: plugins/waku/${label}`);
    return;
  }

  if (!fs.statSync(sourceFile).isFile() || !fs.statSync(packagedFile).isFile()) {
    failures.push(`not comparable as files: ${label}`);
    return;
  }

  const sourceHash = hashFile(sourceFile);
  const packagedHash = hashFile(packagedFile);
  if (sourceHash !== packagedHash) {
    failures.push(`content differs: ${label} -> plugins/waku/${label}`);
  }
}

function listFiles(directory, include = () => true) {
  const files = [];
  walk(directory, "");
  return files.sort();

  function walk(currentDir, prefix) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "public" || entry.name === "dist") {
        continue;
      }
      const relativePath = path.join(prefix, entry.name);
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, relativePath);
      } else if (entry.isFile() && include(toPosix(relativePath))) {
        files.push(relativePath);
      }
    }
  }
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function validateMcpConfigs() {
  const rootMcpPath = path.join(root, ".mcp.json");
  const packagedMcpPath = path.join(packageRoot, ".mcp.json");
  const rootMcp = readJson(rootMcpPath);
  const packagedMcp = readJson(packagedMcpPath);

  const rootServer = rootMcp?.mcpServers?.waku;
  const packagedServer = packagedMcp?.mcpServers?.waku;
  if (!rootServer) failures.push("missing root MCP server config: .mcp.json mcpServers.waku");
  if (!packagedServer) failures.push("missing packaged MCP server config: plugins/waku/.mcp.json mcpServers.waku");
  if (!rootServer || !packagedServer) return;

  const expectedArgs = ["mcp", "serve"];
  if (rootServer.command !== "${CLAUDE_PLUGIN_ROOT}/bin/waku") {
    failures.push("unexpected root MCP launcher command: .mcp.json should use ${CLAUDE_PLUGIN_ROOT}/bin/waku");
  }
  if (packagedServer.command !== "./bin/waku") {
    failures.push("unexpected packaged MCP launcher command: plugins/waku/.mcp.json should use ./bin/waku");
  }
  if (JSON.stringify(rootServer.args) !== JSON.stringify(expectedArgs)) {
    failures.push("unexpected root MCP args: .mcp.json should use [\"mcp\", \"serve\"]");
  }
  if (JSON.stringify(packagedServer.args) !== JSON.stringify(expectedArgs)) {
    failures.push("unexpected packaged MCP args: plugins/waku/.mcp.json should use [\"mcp\", \"serve\"]");
  }
  if (packagedServer.cwd !== ".") {
    failures.push("unexpected packaged MCP cwd: plugins/waku/.mcp.json should set cwd to .");
  }
}

function validateNoBackendExposure() {
  const scriptPath = path.join(root, "scripts", "check-plugin-exposure.mjs");
  if (!fs.existsSync(scriptPath)) {
    failures.push("missing exposure check script: scripts/check-plugin-exposure.mjs");
    return;
  }

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    failures.push(`plugin exposure check failed${output ? `:\n${output}` : ""}`);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`invalid JSON: ${path.relative(root, filePath)} (${error.message})`);
    return null;
  }
}
