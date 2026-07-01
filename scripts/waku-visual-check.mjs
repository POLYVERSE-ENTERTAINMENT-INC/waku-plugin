#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const siteDir = path.resolve(flag("--site-dir", "public"));
const width = Number(flag("--width", "390"));
const height = Number(flag("--height", "844"));
const screenshot = path.resolve(flag("--screenshot", "waku-visual-check.png"));
const chromePath = process.env.WAKU_CHROME_PATH || findChrome();

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("WebSocket connection to Chrome DevTools failed")), { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result || {});
      } else if (message.method && this.events.has(message.method)) {
        this.events.get(message.method)(message.params || {});
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  waitFor(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      this.events.set(method, (params) => {
        clearTimeout(timer);
        this.events.delete(method);
        resolve(params);
      });
    });
  }
}

if (!fs.existsSync(path.join(siteDir, "index.html"))) {
  die(`Missing ${path.join(siteDir, "index.html")}`);
}
if (!chromePath) {
  die("Chrome/Chromium not found. Set WAKU_CHROME_PATH to enable visual checks.");
}

const server = await serve(siteDir);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "waku-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=${userDataDir}`,
  "--remote-debugging-port=0",
  `http://127.0.0.1:${server.port}/`,
], { stdio: ["ignore", "ignore", "pipe"] });

try {
  const browserWs = await waitForDevtools(chrome);
  const pageWs = await waitForPageWs(browserWs, server.port);
  const client = new CdpClient(pageWs);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await client.send("Page.navigate", { url: `http://127.0.0.1:${server.port}/` });
  await client.waitFor("Page.loadEventFired", 10000);
  await sleep(600);

  const metrics = await evalJson(client, `(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const safe = rect(".safe-ui");
    const candidates = Array.from(document.querySelectorAll("iframe, canvas, #core-target, #result-panel, .emoji-game-card, .core-target")).map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), id: el.id || "", className: String(el.className || ""), x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    });
    const violations = [];
    for (const item of candidates) {
      if (!safe || item.width <= 2 || item.height <= 2) continue;
      if (item.tag === "canvas") continue;
      if (item.x < safe.x - 1 || item.y < safe.y - 1 || item.right > safe.right + 1 || item.bottom > safe.bottom + 1) {
        violations.push(item);
      }
    }
    return { viewport: { width: innerWidth, height: innerHeight }, safeUi: safe, stage: rect(".stage"), candidates, violations };
  })()`);

  const image = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(screenshot, Buffer.from(image.data, "base64"));
  console.log(JSON.stringify({ ...metrics, screenshot }, null, 2));
  if (metrics.violations?.length) {
    die("Visual check failed: readable/tappable candidates escaped .safe-ui");
  }
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
} finally {
  await stopProcess(chrome);
  server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function flag(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function die(message) {
  console.error(`Waku visual check failed: ${message}`);
  process.exit(1);
}

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const target = path.resolve(root, `.${pathname}`);
      if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": contentType(target) });
      fs.createReadStream(target).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, close: () => server.close() }));
  });
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function waitForDevtools(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for Chrome DevTools URL")), 10000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("exit", (code) => reject(new Error(`Chrome exited early (${code})`)));
  });
}

async function waitForPageWs(browserWs, port) {
  const httpBase = browserWs.replace(/^ws:/, "http:").replace(/\/devtools\/browser\/.*$/, "");
  for (let i = 0; i < 50; i += 1) {
    const pages = await fetch(`${httpBase}/json/list`).then((res) => res.json()).catch(() => []);
    const page = pages.find((entry) => entry.type === "page" && String(entry.url || "").includes(`127.0.0.1:${port}`));
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await sleep(100);
  }
  throw new Error("Timed out waiting for Chrome page target");
}

async function evalJson(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 1500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
