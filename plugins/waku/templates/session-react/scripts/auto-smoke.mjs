#!/usr/bin/env node
// auto-smoke.mjs — machine verdict on "is it BROKEN?" (not "is it good?").
//
// Part of `npm run verify`. Loads the built product in a real headless mobile
// viewport and auto-asserts the objective failure modes that npm test (static)
// can't catch: white screen, collapsed root, dead/zero-size canvas, uncaught
// page errors, and — if the playable exposes the `window.__waku_debug` hook — a
// stuck state machine (interaction produces no state change).
//
// It deliberately does NOT judge quality. "Looks right / feels good / wow lands"
// is for a human (or the model) to decide by actually playing — use the skill's
// playable-smoke.mjs for that. This script only fast-fails the broken builds so
// that judgment pass isn't wasted, and so the model doesn't burn rounds
// hand-driving the browser to discover a blank screen.
//
// Exit: 0 = PASS or gracefully skipped (no playwright); 1 = FAIL (broken).
//
// Debug hook contract (optional but recommended — see SKILL.md):
//   window.__waku_debug = {
//     getState(): any,     // serialisable snapshot of current phase/state
//     start(): void,       // leave attract/ready, enter the core loop
//     step(n?): void,      // advance the core loop / simulate progress
//   }

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, extname, resolve } from "node:path";

const DIR = resolve(process.argv[2] || "public");
const PORT = Number(process.env.SMOKE_PORT || 8131);

function npmGlobalRoot() {
  try { const p = execSync("npm config get prefix", { encoding: "utf8" }).trim(); if (p) return join(p, "lib/node_modules/"); } catch {}
  return null;
}
function loadPlaywright() {
  const roots = [process.cwd(), npmGlobalRoot(), process.env.NPM_CONFIG_PREFIX ? join(process.env.NPM_CONFIG_PREFIX, "lib/node_modules/") : null, "/home/claude/.npm-global/lib/node_modules/"].filter(Boolean);
  for (const r of roots) { try { return createRequire(r.endsWith("/") ? r : r + "/")("playwright"); } catch {} }
  return null;
}
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base)) {
    if (!d.startsWith("chromium")) continue;
    for (const c of [join(base, d, "chrome-linux/headless_shell"), join(base, d, "chrome-linux/chrome")]) if (existsSync(c)) return c;
  }
  return undefined;
}

function readManifestCaps(dir) {
  try {
    const html = readFileSync(join(dir, "index.html"), "utf8");
    const i = html.indexOf("application/polyverse-manifest");
    if (i < 0) return [];
    const open = html.indexOf(">", i) + 1;
    const end = html.indexOf("</script>", open);
    const j = JSON.parse(html.slice(open, end).trim());
    return Array.isArray(j.capabilities) ? j.capabilities : [];
  } catch { return []; }
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".map": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm" };
async function handler(req, res) {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
    const f = join(DIR, p); const s = await stat(f).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
    res.end(await readFile(f));
  } catch { res.writeHead(500); res.end("500"); }
}
function startServer(port, triesLeft = 10) {
  return new Promise((ok, rej) => {
    const srv = createServer(handler);
    srv.once("error", (e) => { if (e.code === "EADDRINUSE" && triesLeft > 0) startServer(port + 1, triesLeft - 1).then(ok, rej); else rej(e); });
    srv.listen(port, () => ok({ srv, port }));
  });
}

async function main() {
  if (!existsSync(join(DIR, "index.html"))) { console.error(`auto-smoke: ${DIR}/index.html 不存在——先 build`); process.exit(1); }
  const pw = loadPlaywright();
  if (!pw) { console.log("auto-smoke: SKIP — 找不到 playwright(此环境未装)。静态检查已过;动态体检跳过。"); process.exit(0); }

  const fails = [], warns = [];
  const { srv, port } = await startServer(PORT);
  const exe = findChromium();
  let browser;
  try {
    browser = await pw.chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
  } catch (e) { console.log("auto-smoke: SKIP — chromium 启动失败(" + e.message.split("\n")[0] + ")。动态体检跳过。"); srv.close(); process.exit(0); }

  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "zh-CN" });
  const page = await ctx.newPage();
  const pageErrors = [], consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  await page.goto(`http://localhost:${port}/`, { waitUntil: "load", timeout: 15000 }).catch((e) => fails.push("页面加载失败: " + e.message));
  await page.waitForTimeout(1000);

  // ── 结构体检：白屏 / 塌陷 / canvas ──────────────────────────────────────────
  const health = await page.evaluate(`(()=>{
    const root=document.getElementById('root');const rb=root?root.getBoundingClientRect():{width:0,height:0};
    const cs=[...document.querySelectorAll('canvas')].map(c=>({w:c.clientWidth,h:c.clientHeight}));
    let txt=0,painted=0;
    for(const el of document.body.querySelectorAll('*')){const r=el.getBoundingClientRect();if(r.width<2||r.height<2||r.bottom<0||r.top>innerHeight)continue;const s=getComputedStyle(el);if(s.visibility==='hidden'||s.display==='none'||s.opacity==='0')continue;if((el.textContent||'').trim())txt++;if(s.backgroundImage!=='none'||(s.backgroundColor&&s.backgroundColor!=='rgba(0, 0, 0, 0)'))painted++;}
    return {rootW:Math.round(rb.width),rootH:Math.round(rb.height),canvases:cs.length,zeroCanvas:cs.filter(c=>c.w===0||c.h===0).length,visibleText:txt,paintedBoxes:painted};
  })()`).catch(() => null);
  if (!health) fails.push("页面 evaluate 失败(脚本可能崩了)");
  else {
    if (health.rootH < 50) fails.push(`#root 高度仅 ${health.rootH}px — 塌陷(容器 position 被覆写成 height:0)`);
    if (health.zeroCanvas > 0) fails.push(`${health.zeroCanvas}/${health.canvases} 个 canvas 尺寸为 0 — 不显示`);
    if (health.visibleText === 0 && health.paintedBoxes <= 1 && health.canvases === 0) fails.push("首屏几乎无可见内容 — 疑似白屏");
  }

  // ── canvas 是否真画了东西(非纯单色)──────────────────────────────────────
  if (health && health.canvases > 0 && health.zeroCanvas === 0) {
    const painted = await page.evaluate(`(()=>{
      for(const c of document.querySelectorAll('canvas')){try{const ctx=c.getContext('2d');if(!ctx)return 'maybe';const w=Math.min(c.width,64),h=Math.min(c.height,64);if(!w||!h)continue;const d=ctx.getImageData(0,0,w,h).data;const seen=new Set();for(let i=0;i<d.length;i+=16){seen.add(d[i]+','+d[i+1]+','+d[i+2]);if(seen.size>3)return 'painted';}}catch(e){return 'maybe';}}return 'uniform';})()`).catch(() => "maybe");
    if (painted === "uniform") warns.push("canvas 像素近乎单色 — 可能没画出内容(也可能是纯色背景,自行确认)");
  }

  // ── L3-a 行为体检：可达性 / softlock / spam 健壮性(靠 __waku_debug 自驱)────
  const hasHook = await page.evaluate(`!!(window.__waku_debug && typeof window.__waku_debug.getState==='function')`).catch(() => false);
  if (!hasHook) {
    warns.push("无 window.__waku_debug 钩子 — L3 行为体检(可达/softlock/降级)跳过;挂上钩子才能机器自动核(见 SKILL.md)");
  } else {
    const snap = async () => { try { return JSON.stringify(await page.evaluate(`(()=>{try{return window.__waku_debug.getState()}catch(e){return 'ERR:'+e.message}})()`)); } catch { return null; } };
    const drive = async (fn) => { await page.evaluate(`(()=>{try{window.__waku_debug.${fn}&&window.__waku_debug.${fn}()}catch(e){}})()`).catch(() => {}); };
    const s0 = await snap();
    await drive("start"); await page.waitForTimeout(600);
    const states = [s0, await snap()];
    let lastChangeIdx = 1;
    for (let i = 0; i < 12; i++) {
      await drive("step"); await page.waitForTimeout(250);
      const s = await snap(); states.push(s);
      if (s !== states[states.length - 2]) lastChangeIdx = states.length - 1;
    }
    const distinct = new Set(states.filter(Boolean));
    const sFinal = states[states.length - 1] || "";
    const looksTerminal = /result|end|over|done|finish|win|los|complete|gameover|结算|结束|完成/i.test(sFinal);
    if (distinct.size <= 1) {
      fails.push(`状态机卡死 — start()/step() 后状态始终不变(${s0});点了没反应`);
    } else if (!looksTerminal && lastChangeIdx < states.length - 4) {
      warns.push(`疑似 softlock — 推进若干步后状态在非终局处冻结(末态 ${sFinal.slice(0, 60)});确认能真正走到结局`);
    }
  }

  if (pageErrors.length) fails.push(`页面抛异常 ×${pageErrors.length}: ${pageErrors.slice(0, 2).join(" | ")}`);
  if (consoleErrors.length) warns.push(`console error ×${consoleErrors.length}: ${consoleErrors.slice(0, 2).join(" | ")}`);

  // ── L3-b 故障注入:AI 失败时能否体面降级(不白屏)── 仅在声明了 in-content AI 时跑 ──
  const caps = readManifestCaps(DIR);
  const usesAI = caps.some((c) => /^(llm|multimodal)/.test(c));
  if (usesAI) {
    try {
      const fctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "zh-CN" });
      // app 启动前把 window.Polyverse 的调用全变成 reject = 模拟「内容内 AI / 能力挂了」
      await fctx.addInitScript(`(()=>{const rej=()=>Promise.reject(new Error('fault-injected'));const ns=()=>new Proxy({},{get:()=>rej});try{Object.defineProperty(window,'Polyverse',{configurable:true,get(){return {ready:()=>Promise.resolve(),multimodal:ns(),storage:ns(),leaderboard:ns(),host:ns(),app:ns(),media:ns(),project:ns(),assets:ns()};},set(){}});}catch(e){}})()`);
      const fp = await fctx.newPage();
      const fErr = [];
      fp.on("pageerror", (e) => fErr.push(e.message));
      await fp.goto(`http://localhost:${port}/`, { waitUntil: "load", timeout: 15000 }).catch(() => {});
      await fp.waitForTimeout(1200);
      const fh = await fp.evaluate(`(()=>{const r=document.getElementById('root');const rb=r?r.getBoundingClientRect():{height:0};let t=0;for(const el of document.body.querySelectorAll('*')){const b=el.getBoundingClientRect();if(b.width>2&&b.height>2&&(el.textContent||'').trim())t++;}return {h:Math.round(rb.height),txt:t};})()`).catch(() => null);
      const fHook = await fp.evaluate(`!!(window.__waku_debug&&window.__waku_debug.getState)`).catch(() => false);
      if (fHook) { await fp.evaluate(`(()=>{try{window.__waku_debug.start&&window.__waku_debug.start()}catch(e){}})()`).catch(() => {}); await fp.waitForTimeout(500); }
      if (!fh || fh.h < 50 || fh.txt === 0) fails.push("故障注入(AI 调用全 reject)后白屏/塌陷 — 缺降级分支,运行时 AI 挂了会崩");
      else if (fErr.length) warns.push(`故障注入后页面抛异常 ×${fErr.length} — 降级分支没接住: ${(fErr[0] || "").slice(0, 60)}`);
      await fctx.close();
    } catch (e) { warns.push("故障注入体检异常(跳过): " + (e.message || "").slice(0, 50)); }
  }

  await browser.close(); srv.close();

  // ── 判决 ─────────────────────────────────────────────────────────────────
  console.log(`\n=== auto-smoke @ ${DIR} ===`);
  if (health) console.log(`首屏: #root ${health.rootW}×${health.rootH}, canvas ${health.canvases}, 可见文字块 ${health.visibleText}`);
  for (const w of warns) console.log("  ⚠ " + w);
  if (fails.length) {
    for (const f of fails) console.log("  ✗ " + f);
    console.log("VERDICT: FAIL(客观坏)——修上面 ✗ 项;✗ 清零后再用 playable-smoke.mjs 真玩一遍判好不好。");
    process.exit(1);
  }
  console.log("VERDICT: PASS(不坏)——构建/不白屏/状态机能推进。这只证『没坏』,好不好用 playable-smoke.mjs 真玩一遍自己判。");
  process.exit(0);
}
main().catch((e) => { console.error("auto-smoke 自身失败:", e.message); process.exit(1); });
