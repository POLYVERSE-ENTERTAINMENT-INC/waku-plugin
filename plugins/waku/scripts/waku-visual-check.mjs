#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const siteDir = path.resolve(flag("--site-dir", "public"));
const width = Number(flag("--width", "390"));
const height = Number(flag("--height", "844"));
const screenshot = path.resolve(flag("--screenshot", "waku-visual-check.png"));
const reportPath = path.resolve(flag("--report", path.join(path.dirname(screenshot), "waku-visual-report.json")));
const hostTopReserve = Number(flag("--host-top-reserve", "56"));
const hostBottomReserve = Number(flag("--host-bottom-reserve", "82"));
const chromePath = await resolveChrome();

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
  die("Chromium browser runtime not found and managed Chromium download failed. Set WAKU_CHROME_PATH to a Chromium-family browser binary and rerun the visual gate.");
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
    const hostReserve = { top: ${JSON.stringify(hostTopReserve)}, bottom: ${JSON.stringify(hostBottomReserve)} };
    const rectOf = (el, offset = { x: 0, y: 0 }) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x + offset.x),
        y: Math.round(r.y + offset.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
        right: Math.round(r.right + offset.x),
        bottom: Math.round(r.bottom + offset.y),
      };
    };
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return rectOf(el);
    };
    const textOf = (el) => (el.innerText || el.textContent || el.getAttribute("aria-label") || el.id || el.className || "").toString().trim().slice(0, 80);
    const summarize = (el, offset, source) => {
      const box = rectOf(el, offset);
      return {
        source,
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        className: String(el.className || ""),
        text: textOf(el),
        ...box,
      };
    };
    const visible = (el) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.02 && r.width > 2 && r.height > 2;
    };
    const readableSelector = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[tabindex]:not([tabindex='-1'])",
      ".hud",
      ".stat",
      ".hint",
      ".overlay-panel",
      ".panel",
      ".card",
      ".score",
      ".controls",
      "[id*='score' i]",
      "[id*='best' i]",
      "[id*='speed' i]",
      "[id*='pause' i]",
      "[class*='score' i]",
      "[class*='hud' i]",
      "[class*='control' i]"
    ].join(",");
    const isBroadContainer = (el) => {
      const r = el.getBoundingClientRect();
      const view = el.ownerDocument.defaultView || window;
      const className = String(el.className || "");
      const tag = el.tagName.toLowerCase();
      const keepContainer = /(?:overlay-panel|stat|card|panel|button|control)/i.test(className) || ["button", "a", "input", "select", "textarea"].includes(tag);
      if (keepContainer) return false;
      const nested = Array.from(el.querySelectorAll(readableSelector)).filter((child) => child !== el && visible(child)).length;
      return nested > 0 && (r.height > view.innerHeight * 0.55 || r.width > view.innerWidth * 0.92);
    };
    const safe = rect(".safe-ui");
    const candidates = Array.from(document.querySelectorAll("iframe, canvas, #core-target, #result-panel, .emoji-game-card, .core-target, .safe-center > *"))
      .filter(visible)
      .map((el) => summarize(el, { x: 0, y: 0 }, "top"));
    const readable = Array.from(document.querySelectorAll(readableSelector))
      .filter((el) => visible(el) && !el.closest(".stage") && !isBroadContainer(el))
      .map((el) => summarize(el, { x: 0, y: 0 }, "top-readable"));
    const iframeReadable = [];
    const iframeAccessFailures = [];
    for (const iframe of Array.from(document.querySelectorAll("iframe")).filter(visible)) {
      const iframeRect = iframe.getBoundingClientRect();
      let doc;
      try {
        doc = iframe.contentDocument;
      } catch {
        doc = null;
      }
      if (!doc?.body) {
        iframeAccessFailures.push(summarize(iframe, { x: 0, y: 0 }, "iframe"));
        continue;
      }
      const nested = Array.from(doc.querySelectorAll(readableSelector)).filter((el) => visible(el) && !isBroadContainer(el));
      if (nested.length === 0) {
        iframeReadable.push({ ...summarize(iframe, { x: 0, y: 0 }, "iframe-uninspectable-ui"), text: "iframe treated as readable/tappable legacy surface" });
      } else {
        for (const el of nested) {
          iframeReadable.push(summarize(el, { x: iframeRect.x, y: iframeRect.y }, "iframe-readable"));
        }
      }
    }
    const readableCandidates = [...readable, ...iframeReadable];
    const violations = [];
    for (const item of candidates) {
      if (!safe || item.width <= 2 || item.height <= 2) continue;
      if (item.tag === "canvas") continue;
      if (item.x < safe.x - 1 || item.y < safe.y - 1 || item.right > safe.right + 1 || item.bottom > safe.bottom + 1) {
        violations.push({ reason: "outside .safe-ui", ...item });
      }
    }
    for (const item of readableCandidates) {
      if (!safe || item.width <= 2 || item.height <= 2) continue;
      if (item.x < safe.x - 1 || item.y < safe.y - 1 || item.right > safe.right + 1 || item.bottom > safe.bottom + 1) {
        violations.push({ reason: "readable/tappable UI outside .safe-ui", ...item });
      }
      if (item.y < hostReserve.top || item.bottom > innerHeight - hostReserve.bottom) {
        violations.push({ reason: "readable/tappable UI intersects simulated Waku host chrome", ...item });
      }
    }
    for (const item of iframeAccessFailures) {
      violations.push({ reason: "iframe content is not inspectable; cannot prove legacy UI avoids host chrome", ...item });
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      hostReserve,
      hostSafeRect: { x: 0, y: hostReserve.top, width: innerWidth, height: innerHeight - hostReserve.top - hostReserve.bottom, right: innerWidth, bottom: innerHeight - hostReserve.bottom },
      safeUi: safe,
      stage: rect(".stage"),
      candidates,
      readableCandidates,
      violations
    };
  })()`);

  await client.send("Runtime.evaluate", { expression: `(() => {
    const top = document.createElement("div");
    top.setAttribute("data-waku-visual-host-top", "");
    Object.assign(top.style, { position: "fixed", left: "0", right: "0", top: "0", height: "${hostTopReserve}px", zIndex: "2147483647", pointerEvents: "none", background: "rgba(255,0,96,0.16)", borderBottom: "2px solid rgba(255,0,96,0.55)" });
    const bottom = document.createElement("div");
    bottom.setAttribute("data-waku-visual-host-bottom", "");
    Object.assign(bottom.style, { position: "fixed", left: "0", right: "0", bottom: "0", height: "${hostBottomReserve}px", zIndex: "2147483647", pointerEvents: "none", background: "rgba(255,0,96,0.16)", borderTop: "2px solid rgba(255,0,96,0.55)" });
    document.body.append(top, bottom);
  })()` });

  const image = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(screenshot, Buffer.from(image.data, "base64"));
  const failures = (metrics.violations ?? []).map(visualIssue);
  const report = {
    ok: failures.length === 0,
    gate: "waku-visual",
    siteDir,
    reportPath,
    screenshot,
    checkedAt: new Date().toISOString(),
    viewport: metrics.viewport,
    hostReserve: metrics.hostReserve,
    hostSafeRect: metrics.hostSafeRect,
    safeUi: metrics.safeUi,
    stage: metrics.stage,
    candidateCounts: {
      surfaces: metrics.candidates?.length ?? 0,
      readableOrTappable: metrics.readableCandidates?.length ?? 0,
      violations: metrics.violations?.length ?? 0,
    },
    failures,
    next_actions: nextActions(failures, { siteDir, screenshot, reportPath }),
    rawViolations: metrics.violations ?? [],
  };
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    die("Visual check failed: readable/tappable candidates escaped .safe-ui or intersected simulated Waku host chrome", { skipReport: true });
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

function die(message, options = {}) {
  if (!options.skipReport) {
    writeReport({
      ok: false,
      gate: "waku-visual",
      siteDir,
      reportPath,
      screenshot,
      checkedAt: new Date().toISOString(),
      failures: [{
        severity: "error",
        code: visualErrorCode(message),
        message,
        fix: visualFix(message),
        evidence: {},
      }],
      next_actions: nextActions([{
        severity: "error",
        code: visualErrorCode(message),
        message,
        fix: visualFix(message),
        evidence: {},
      }], { siteDir, screenshot, reportPath }),
    });
  }
  console.error(`Waku visual check failed: ${message}`);
  console.error(`Report: ${reportPath}`);
  process.exit(1);
}

function visualIssue(violation) {
  const code = visualErrorCode(violation.reason);
  return {
    severity: "error",
    code,
    message: visualMessage(violation),
    fix: visualFix(violation.reason),
    evidence: {
      reason: violation.reason,
      source: violation.source,
      tag: violation.tag,
      id: violation.id,
      className: violation.className,
      text: violation.text,
      rect: {
        x: violation.x,
        y: violation.y,
        width: violation.width,
        height: violation.height,
        right: violation.right,
        bottom: violation.bottom,
      },
      screenshot,
    },
  };
}

function visualMessage(violation) {
  const label = [violation.tag, violation.id ? `#${violation.id}` : "", violation.className ? `.${String(violation.className).trim().replace(/\s+/g, ".")}` : ""]
    .filter(Boolean)
    .join("");
  const text = violation.text ? ` text="${violation.text}"` : "";
  return `${violation.reason}: ${label || "element"}${text} at x=${violation.x}, y=${violation.y}, w=${violation.width}, h=${violation.height}.`;
}

function visualErrorCode(reason = "") {
  const text = reason.toLowerCase();
  if (text.includes("host chrome")) return "visual.host-chrome-overlap";
  if (text.includes("outside .safe-ui") || text.includes("escaped .safe-ui")) return "visual.safe-ui-escape";
  if (text.includes("iframe content is not inspectable")) return "visual.iframe-uninspectable";
  if (text.includes("chrome/chromium") || text.includes("chromium browser runtime") || text.includes("managed chromium")) return "visual.chrome-missing";
  if (text.includes("missing")) return "visual.artifact-missing";
  return "visual.failed";
}

function visualFix(reason = "") {
  const code = visualErrorCode(reason);
  const fixes = {
    "visual.host-chrome-overlap": "Move readable/tappable UI into .safe-ui and reserve --safe-top/--safe-bottom. Put instructions, pause buttons, HUD, and result panels in DOM safe-area layers, not at raw viewport edges.",
    "visual.safe-ui-escape": "Constrain this element inside .safe-ui/.safe-center or convert it to world-only canvas content if it is not readable/tappable UI.",
    "visual.iframe-uninspectable": "Use a same-origin adapted page or port the legacy UI into React so the gate can verify controls and text avoid host chrome.",
    "visual.chrome-missing": "The gate could not find or download a Chromium runtime. Connect to the internet and rerun, or set WAKU_CHROME_PATH to Chrome, Chromium, Edge, Brave, Arc, or Chrome for Testing.",
    "visual.artifact-missing": "Build the playable first and point --site-dir at the generated directory that contains index.html.",
    "visual.failed": "Open the screenshot and report, then adjust layout until all readable/tappable UI stays inside the simulated host-safe area.",
  };
  return fixes[code];
}

function writeReport(report) {
  try {
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    console.warn(`WARN [report.write-failed] Could not write visual report: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function nextActions(issues, context) {
  if (!issues.length) return [];
  const seen = new Set();
  return issues
    .filter((issue) => {
      if (seen.has(issue.code)) return false;
      seen.add(issue.code);
      return true;
    })
    .map((issue, index) => ({
      priority: index + 1,
      code: issue.code,
      action: visualActionForCode(issue.code),
      fix: issue.fix,
      evidence: issue.evidence,
      inspect: {
        screenshot: context.screenshot,
        report: context.reportPath,
      },
      rerun: {
        command: `node scripts/waku-visual-check.mjs --site-dir ${shellQuote(context.siteDir)} --screenshot ${shellQuote(context.screenshot)} --report ${shellQuote(context.reportPath)}`,
      },
    }));
}

function visualActionForCode(code) {
  const actions = {
    "visual.host-chrome-overlap": "Move the listed readable/tappable element away from the simulated Waku top or bottom chrome.",
    "visual.safe-ui-escape": "Constrain the listed element inside .safe-ui/.safe-center or make it world-only canvas content.",
    "visual.iframe-uninspectable": "Make the legacy iframe same-origin/inspectable or port its UI into React safe-area components.",
    "visual.chrome-missing": "Rerun to let Waku download managed Chromium, or set WAKU_CHROME_PATH to an existing Chromium-family browser.",
    "visual.artifact-missing": "Build the playable and point --site-dir at the generated directory.",
  };
  return actions[code] ?? "Open the screenshot and repair layout until all readable/tappable UI stays inside the host-safe area.";
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function resolveChrome() {
  const explicit = process.env.WAKU_CHROME_PATH;
  if (explicit) return fs.existsSync(explicit) ? explicit : "";

  const local = findChrome();
  if (local) return local;

  const managed = findManagedChromium();
  if (managed) return managed;

  if (process.env.WAKU_NO_BROWSER_DOWNLOAD === "1") {
    return "";
  }

  console.error("[waku-visual] Chromium-family browser not found; downloading managed Chromium with Playwright...");
  const install = spawnSync("npm", ["exec", "--yes", "playwright@1.56.1", "--", "install", "chromium"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_BROWSER_GC: process.env.PLAYWRIGHT_SKIP_BROWSER_GC || "1",
    },
  });
  if (install.status !== 0) {
    console.error("[waku-visual] Managed Chromium download failed.");
    return "";
  }

  return findManagedChromium();
}

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Arc.app/Contents/MacOS/Arc",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/brave-browser",
    "/snap/bin/chromium",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function findManagedChromium() {
  const cacheRoots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0" ? process.env.PLAYWRIGHT_BROWSERS_PATH : "",
    path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
    path.join(os.homedir(), ".cache", "ms-playwright"),
    path.join(os.homedir(), "AppData", "Local", "ms-playwright"),
  ].filter(Boolean);

  const executableNames = new Set([
    "chrome",
    "chrome.exe",
    "chromium",
    "chromium.exe",
    "Chromium",
    "Chromium.exe",
    "headless_shell",
    "headless_shell.exe",
  ]);

  for (const cacheRoot of cacheRoots) {
    const found = findExecutable(cacheRoot, executableNames);
    if (found) return found;
  }
  return "";
}

function findExecutable(root, executableNames) {
  if (!fs.existsSync(root)) return "";
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && executableNames.has(entry.name)) {
        return fullPath;
      }
    }
  }
  return "";
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
