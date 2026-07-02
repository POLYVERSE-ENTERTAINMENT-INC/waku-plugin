#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const checker = path.join(root, "scripts", "waku-conformance-check.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "waku-fixtures-"));

try {
  const cases = [
    { name: "valid-safe-iframe", kind: "valid", expect: 0 },
    { name: "bad-stage-iframe", kind: "stageIframe", expect: 1 },
    { name: "plain-vite", kind: "plain", expect: 1 },
    { name: "scaled-legacy", kind: "scaledLegacy", expect: 1 },
  ];

  for (const item of cases) {
    const dir = path.join(tmp, item.name);
    makeFixture(dir, item.kind);
    const reportPath = path.join(dir, "waku-conformance-report.json");
    const result = spawnSync(process.execPath, [checker, "--source-dir", dir, "--site-dir", path.join(dir, "public"), "--report", reportPath], {
      encoding: "utf8",
    });
    const pass = item.expect === 0 ? result.status === 0 : result.status !== 0;
    if (!pass) {
      console.error(`fixture ${item.name} failed expectation`);
      console.error(result.stdout);
      console.error(result.stderr);
      process.exit(1);
    }
    assertReport(reportPath, item.expect === 0);
    console.log(`fixture ok: ${item.name}`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

function assertReport(reportPath, expectOk) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    console.error(`fixture report missing or invalid: ${reportPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (report.ok !== expectOk) {
    console.error(`fixture report ok mismatch: ${reportPath}`);
    process.exit(1);
  }
  if (!expectOk) {
    const first = report.failures?.[0];
    if (!first?.code || !first?.message || !first?.fix) {
      console.error(`fixture report lacks explainable issue fields: ${reportPath}`);
      process.exit(1);
    }
  }
}

function makeFixture(dir, kind) {
  fs.mkdirSync(path.join(dir, "src", "playable"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "waku"), { recursive: true });
  fs.mkdirSync(path.join(dir, "public", "vendor"), { recursive: true });

  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    private: true,
    scripts: { test: "node scripts/runtime-contract-check.js" },
    dependencies: { react: "x", "react-dom": "x" },
    devDependencies: { tailwindcss: "x", "@vitejs/plugin-react": "x", "@tailwindcss/vite": "x" },
  }, null, 2));

  const app = kind === "plain"
    ? `<div>Hello</div>`
    : kind === "stageIframe"
      ? `<div className="bg-layer" /><section className="stage"><iframe src="./legacy.html" /></section><main className="safe-ui"><section id="safe-center" className="safe-center"><div id="core-target" /></section></main>`
      : kind === "scaledLegacy"
        ? `<div className="bg-layer" /><section className="stage" /><main className="safe-ui"><section id="safe-center" className="safe-center"><div className="safe-frame"><iframe src="./legacy.html" /></div><div id="core-target" /></section></main>`
      : `<div className="bg-layer" /><section className="stage" /><main className="safe-ui"><section id="safe-center" className="safe-center"><div className="safe-frame"><iframe src="./legacy.html" /></div><div id="core-target" /></section></main>`;
  fs.writeFileSync(path.join(dir, "src", "App.tsx"), app);
  const scaleCss = kind === "scaledLegacy" ? " .safe-frame{transform:scale(0.72);}" : " .safe-frame{}";
  fs.writeFileSync(path.join(dir, "src", "index.css"), `:root{--runtime-safe-top:0px;--runtime-safe-bottom:0px;--waku-top-chrome:56px;--waku-bottom-chrome:82px;--safe-top:calc(var(--runtime-safe-top) + var(--waku-top-chrome));--safe-bottom:var(--waku-bottom-chrome);} .bg-layer{} .stage{} .safe-ui{top:calc(var(--safe-top));bottom:calc(var(--safe-bottom));} .safe-center{} .core-target{}${scaleCss}`);
  fs.writeFileSync(path.join(dir, "src", "playable", "usePlayableState.ts"), `const phases = ["intro","menu","playing","result"]; registerWakuPreviewStates(); reportWakuPreviewState(); window.__WAKU_GAME__={}; window.__waku_debug={};`);
  fs.writeFileSync(path.join(dir, "src", "waku", "polyverse.ts"), `export {};`);
  fs.writeFileSync(path.join(dir, "template.json"), JSON.stringify({ id: "polyverse-session-template-dev", source: "bundled", version: "0.2.0" }));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts", "runtime-contract-check.js"), "");

  fs.writeFileSync(path.join(dir, "public", "index.html"), `<!doctype html><script type="application/polyverse-manifest">{"runtime":"@polyverse/content-runtime@1","capabilities":[]}</script><script type="application/json" id="polyverse-capability-reference" data-reference-only="true">{"referenceOnly":true,"capabilities":[]}</script><script src="./vendor/polyverse-content-runtime.min.js"></script>`);
  fs.writeFileSync(path.join(dir, "public", "vendor", "polyverse-content-runtime.min.js"), "Polyverse");
}
