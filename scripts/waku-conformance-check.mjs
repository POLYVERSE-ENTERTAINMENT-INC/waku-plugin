#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function readFlag(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${name}`);
  }
  return value;
}

const sourceDir = path.resolve(readFlag("--source-dir", process.cwd()));
const siteDir = path.resolve(readFlag("--site-dir", path.join(sourceDir, "public")));
const reportPath = path.resolve(readFlag("--report", path.join(sourceDir, "waku-conformance-report.json")));

const failures = [];
const warnings = [];

function fail(message, details = {}) {
  failures.push(makeIssue("error", message, details));
}

function warn(message, details = {}) {
  warnings.push(makeIssue("warning", message, details));
}

function makeIssue(severity, message, details) {
  const code = details.code ?? issueCode(message);
  return {
    severity,
    code,
    message,
    fix: details.fix ?? suggestedFix(message),
    evidence: details.evidence ?? {},
  };
}

function issueCode(message) {
  const text = message.toLowerCase();
  if (text.includes("built site") || text.includes("index.html") || text.includes("vendor/polyverse")) return "artifact.invalid";
  if (text.includes("template.json") || text.includes("bundled waku session template")) return "template.invalid";
  if (text.includes(".bg-layer") || text.includes(".stage") || text.includes(".safe-ui") || text.includes(".safe-center")) return "shell.invalid";
  if (text.includes("safe-area") || text.includes("--safe-top") || text.includes("--safe-bottom") || text.includes("host chrome")) return "safe-area.invalid";
  if (text.includes("iframe")) return "legacy-iframe.unsafe";
  if (text.includes("scale")) return "layout.scale-to-fit";
  if (text.includes("debug ui") || text.includes("template demo") || text.includes("runtimeprobe") || text.includes("deviceprobe")) return "template-debug-ui.present";
  if (text.includes("intro") || text.includes("playing") || text.includes("result")) return "states.missing";
  if (text.includes("red-line") || text.includes("api") || text.includes("token") || text.includes("provider")) return "runtime.red-line";
  if (text.includes("package.json") || text.includes("scripts.test")) return "test-contract.invalid";
  return "conformance.failed";
}

function suggestedFix(message) {
  const code = issueCode(message);
  const fixes = {
    "artifact.invalid": "Run the template build/test, then publish the generated site directory that contains index.html, the Polyverse manifest, and vendor runtime.",
    "template.invalid": "Recreate or adapt the project through the plugin launcher command `waku template copy <dir>` (or `node <plugin-root>/scripts/waku-copy-template.mjs <dir>` if the launcher is unavailable) and migrate the game into the bundled session template instead of hand-writing the shell.",
    "shell.invalid": "Restore the template shell elements in src/App.*: .bg-layer, .stage, .safe-ui, and .safe-center must be real source structure.",
    "safe-area.invalid": "Restore the official safe-area variables and apply --safe-top/--safe-bottom to .safe-ui so HUD, buttons, hints, and panels avoid host chrome.",
    "legacy-iframe.unsafe": "Move readable/tappable legacy UI into a bounded .safe-ui/.safe-center wrapper or port it into React components; keep .stage for world visuals only.",
    "layout.scale-to-fit": "Do not shrink an oversized page with transform: scale(...). Split the playable into intro/menu, playing, and result states.",
    "template-debug-ui.present": "Remove visible template-only debug/demo UI from the production App. Keep invisible hooks such as window.__WAKU_GAME__, window.__waku_debug, and preview state reporting.",
    "states.missing": "Add explicit state screens for intro/menu, playing, and result so instructions, controls, gameplay, and outcomes do not crowd one viewport.",
    "runtime.red-line": "Remove direct provider keys, localhost endpoints, raw tokens, and direct AI calls; route capabilities through the Waku runtime SDK.",
    "test-contract.invalid": "Add the template package.json test script and make it run the runtime contract checks before publishing.",
    "conformance.failed": "Adapt the project through the Waku template contract and rerun this gate.",
  };
  return fixes[code];
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function walk(dir, options = {}) {
  const results = [];
  const ignoredDirs = new Set([
    ".git",
    "node_modules",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "coverage",
    ...(options.ignoredDirs ?? []),
  ]);
  const ignoredFiles = new Set(options.ignoredFiles ?? []);

  function visit(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) visit(fullPath);
      } else if (entry.isFile()) {
        if (!ignoredFiles.has(entry.name)) results.push(fullPath);
      }
    }
  }

  visit(dir);
  return results;
}

function readAllText(dir, options = {}) {
  if (!exists(dir)) return "";
  const extensions = new Set([
    ".css",
    ".html",
    ".js",
    ".jsx",
    ".json",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".vue",
    ".svelte",
  ]);
  return walk(dir, options)
    .filter((file) => extensions.has(path.extname(file)))
    .map((file) => {
      try {
        return `\n/* ${path.relative(dir, file)} */\n${readText(file)}`;
      } catch {
        return "";
      }
    })
    .join("\n");
}

function hasAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function source(pathname) {
  const filePath = path.join(sourceDir, pathname);
  return exists(filePath) ? readText(filePath) : "";
}

function checkBuiltArtifact() {
  if (!exists(siteDir)) {
    fail(`Built site directory not found: ${siteDir}. Run the template build/test before publishing.`);
    return;
  }

  const indexPath = path.join(siteDir, "index.html");
  if (!exists(indexPath)) {
    fail(`Built site is missing index.html: ${indexPath}`);
    return;
  }

  const html = readText(indexPath);
  if (!html.includes("application/polyverse-manifest")) {
    fail("Built index.html is missing <script type=\"application/polyverse-manifest\">.");
  }
  if (!html.includes("polyverse-content-runtime.min.js")) {
    fail("Built index.html does not load vendor/polyverse-content-runtime.min.js before the app.");
  }
  if (!html.includes("polyverse-capability-reference")) {
    warn("Built index.html is missing polyverse-capability-reference; add it when capabilities are used.");
  }
  if (!exists(path.join(siteDir, "vendor", "polyverse-content-runtime.min.js"))) {
    fail("Built artifact is missing vendor/polyverse-content-runtime.min.js.");
  }
}

function checkTemplateContract() {
  if (!exists(sourceDir)) {
    fail(`Source directory not found: ${sourceDir}`);
    return;
  }

  const templateMetaPath = path.join(sourceDir, "template.json");
  if (!exists(templateMetaPath)) {
    fail("Missing template.json. New and adapted Waku projects must be created from the bundled plugin template via the plugin launcher command `waku template copy <dir>` or `node <plugin-root>/scripts/waku-copy-template.mjs <dir>`; do not hand-write a replacement shell.");
  } else {
    try {
      const meta = JSON.parse(readText(templateMetaPath));
      if (meta.id !== "polyverse-session-template-dev" || meta.source !== "bundled") {
        fail("template.json does not identify the bundled Waku session template. Recreate the project with the plugin launcher command `waku template copy <dir>` or `node <plugin-root>/scripts/waku-copy-template.mjs <dir>` and migrate the content into it.");
      }
    } catch {
      fail("template.json is not valid JSON.");
    }
  }

  const sourceText = readAllText(sourceDir, {
    ignoredDirs: ["public", "dist", "build", "out"],
    ignoredFiles: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"],
  });
  const builtText = readAllText(siteDir, {
    ignoredDirs: ["assets", "locales", "vendor"],
    ignoredFiles: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"],
  });
  const combined = `${sourceText}\n${builtText}`;

  const requiredMarkers = [
    [".bg-layer", "template shell marker .bg-layer"],
    [".stage", "template shell marker .stage"],
    [".safe-ui", "template shell marker .safe-ui"],
    ["safe-center", "template shell marker .safe-center"],
    ["__WAKU_GAME__", "Waku probe window.__WAKU_GAME__"],
    ["__waku_debug", "Waku debug hook window.__waku_debug"],
  ];

  for (const [needle, label] of requiredMarkers) {
    if (!combined.includes(needle)) fail(`Missing ${label}. Adapt the project through the Waku session template before publishing.`);
  }

  if (!hasAny(combined, ["registerWakuPreviewStates", "reportWakuPreviewState"])) {
    fail("Missing preview-state registration/reporting hooks from the Waku template.");
  }

  if (!exists(path.join(sourceDir, "src", "waku"))) {
    fail("Missing src/waku adapter directory. Existing projects must be adapted into the Waku template contract before publishing.");
  }

  checkAdaptationStructure(builtText);

  const packagePath = path.join(sourceDir, "package.json");
  if (!exists(packagePath)) {
    fail("Missing package.json. Publishable Waku projects should be adapted into the session template and expose npm run test.");
    return;
  }

  let packageJson;
  try {
    packageJson = JSON.parse(readText(packagePath));
  } catch {
    fail("package.json is not valid JSON.");
    return;
  }

  const testScript = packageJson.scripts?.test ?? "";
  if (!testScript) {
    fail("package.json is missing scripts.test. Template contract checks must run before publishing.");
  } else if (!testScript.includes("runtime-contract-check")) {
    warn("scripts.test does not mention runtime-contract-check.js; ensure the equivalent template floor is covered.");
  }
}

function checkAdaptationStructure(builtText) {
  const appSource = source("src/App.tsx") || source("src/App.jsx") || source("src/App.js");
  const cssText = source("src/index.css");
  const sourceContractText = readAllText(sourceDir, {
    ignoredDirs: ["public", "dist", "build", "out"],
    ignoredFiles: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"],
  });
  if (!appSource) {
    fail("Missing src/App.* template shell. Adapt the project through the Waku session template before publishing.");
    return;
  }

  checkNoTemplateDebugUi(appSource, builtText);

  const appRequiredMarkers = [
    [/\bclassName=["'][^"']*\bbg-layer\b/i, "src/App.* .bg-layer shell element"],
    [/\bclassName=["'][^"']*\bsafe-ui\b/i, "src/App.* .safe-ui shell element"],
    [/\bclassName=["'][^"']*\bsafe-center\b/i, "src/App.* .safe-center shell element"],
  ];
  for (const [pattern, label] of appRequiredMarkers) {
    if (!pattern.test(appSource)) fail(`Missing ${label}. Marker strings in unrelated files do not satisfy the Waku template contract.`);
  }
  if (!/\bclassName=["'][^"']*\bstage\b/i.test(sourceContractText)) {
    fail("Missing .stage shell element in src/. Template projects may render it through a component, but it must exist in source.");
  }

  const cssRequiredMarkers = [
    ["--runtime-safe-top", "runtime safe-area top variable"],
    ["--runtime-safe-bottom", "runtime safe-area bottom variable"],
    ["--waku-top-chrome", "Waku host top chrome variable"],
    ["--waku-bottom-chrome", "Waku host bottom chrome variable"],
    ["--safe-top", "composed safe top variable"],
    ["--safe-bottom", "composed safe bottom variable"],
  ];
  for (const [needle, label] of cssRequiredMarkers) {
    if (!cssText.includes(needle)) {
      fail(`Missing ${label} in src/index.css. The Waku shell must reserve host chrome, not only device safe-area insets.`);
    }
  }

  const additiveSafeTop =
    /--safe-top\s*:\s*calc\(\s*var\(--runtime-safe-top\)\s*\+\s*var\(--waku-top-chrome\)\s*\)/.test(cssText);
  if (!additiveSafeTop) {
    fail("src/index.css must keep the official additive safe-area formula: --safe-top: calc(var(--runtime-safe-top) + var(--waku-top-chrome)). Do not replace it with max(...) or a hand-written approximation.");
  }

  const safeBottomUsesChrome =
    /--safe-bottom\s*:\s*(?:var\(--waku-bottom-chrome\)|calc\([^;]*var\(--runtime-safe-bottom\)[^;]*var\(--waku-bottom-chrome\)[^;]*\))/.test(cssText);
  if (!safeBottomUsesChrome) {
    fail("src/index.css must derive --safe-bottom from --waku-bottom-chrome so bottom host controls are reserved by the template contract.");
  }

  const safeUiUsesHostChrome =
    /\.safe-ui\b[\s\S]{0,900}(?:top\s*:\s*calc\([^;}]*var\(--safe-top\)|padding[\s\S]{0,500}var\(--safe-top\))/i.test(cssText) &&
    /\.safe-ui\b[\s\S]{0,1200}(?:bottom\s*:\s*calc\([^;}]*var\(--safe-bottom\)|padding[\s\S]{0,700}var\(--safe-bottom\))/i.test(cssText);
  if (!safeUiUsesHostChrome) {
    fail("src/index.css .safe-ui must apply --safe-top and --safe-bottom so readable/tappable UI avoids Waku host chrome.");
  }

  checkNoScaleToFit(cssText, sourceContractText);

  const stageBlocks = [
    ...sourceContractText.matchAll(/<([A-Za-z][\w.]*)\b(?=[^>]*className=["'][^"']*\bstage\b[^"']*["'])(?![^>]*\/>)[^>]*>([\s\S]*?)<\/\1>/gi),
  ];
  const stageWithIframe = stageBlocks.some((match) => /<iframe\b/i.test(match[2]));
  if (stageWithIframe) {
    fail(
      "Iframe-based adaptation places the existing game inside .stage. .stage is full-bleed and may cross host chrome; readable/tappable existing UI must be constrained inside .safe-ui/.safe-center or ported into React components.",
    );
  }

  const hasIframe = /<iframe\b/i.test(appSource);
  if (hasIframe) {
    checkStateSplitForLegacy(sourceContractText);

    const safeCenterWithIframe = /className=["'][^"']*\bsafe-center\b[^"']*["'][\s\S]{0,2200}<iframe\b/i.test(appSource);
    const safeWrapperWithIframe = /className=["'][^"']*(?:safe|card|panel|viewport|frame)[^"']*["'][\s\S]{0,1400}<iframe\b/i.test(appSource);
    if (!safeCenterWithIframe && !safeWrapperWithIframe) {
      fail(
        "Iframe-based adaptation must put the embedded game inside a bounded safe-area wrapper, not as an unconstrained full-screen page.",
      );
    }

    const unsafeIframeCss = /\.stage\s+iframe\b[\s\S]{0,500}(?:position\s*:\s*fixed|inset\s*:\s*0|height\s*:\s*100vh)/i.test(cssText);
    if (unsafeIframeCss) {
      fail("Iframe CSS makes the embedded existing game full-bleed inside .stage; constrain it inside .safe-ui/.safe-center instead.");
    }
  }
}

function checkNoTemplateDebugUi(appSource, builtText) {
  const visibleTemplateUi = [
    [/RuntimeProbe/i, "RuntimeProbe"],
    [/DeviceProbe/i, "DeviceProbe"],
    [/GestureHintShowcase/i, "GestureHintShowcase"],
    [/DefaultPlayable/i, "DefaultPlayable template demo"],
  ];
  for (const [pattern, label] of visibleTemplateUi) {
    if (pattern.test(appSource)) {
      fail(`Visible template debug UI remains in src/App.*: ${label}. Replace the scaffold demo/probe components with the actual playable UI before publishing.`);
    }
  }

  const builtDebugUi = [
    [/runtime-probe/i, ".runtime-probe"],
    [/device-probe/i, ".device-probe"],
    [/probe-button/i, ".probe-button"],
    [/probe-llm|probe-image/i, "runtime probe controls"],
    [/GestureHintShowcase/i, "GestureHintShowcase"],
  ];
  for (const [pattern, label] of builtDebugUi) {
    if (pattern.test(builtText)) {
      fail(`Built artifact contains visible template debug UI marker ${label}. Remove scaffold probes/demo UI from production output before publishing.`);
    }
  }
}

function checkNoScaleToFit(cssText, sourceText) {
  const suspiciousScaleSelector =
    /(?:\.safe-ui|\.safe-center|\.safe-frame|iframe|\.legacy|\.game-card|\.playable|\.core-target|#core-target|#game|#app)[^{]{0,120}\{[^}]*transform\s*:\s*[^;}]*scale\(\s*(?:0?\.\d+|var\()/i;
  if (suspiciousScaleSelector.test(cssText)) {
    fail("Do not use transform: scale(...) on safe-area, iframe, legacy, or game-root UI to force an oversized page into one screen. Split intro/menu, playing, and result states instead.");
  }

  const inlineScaleToFit =
    /(?:className|id)=["'][^"']*(?:safe|frame|legacy|game|playable|core)[^"']*["'][\s\S]{0,400}(?:transform\s*:\s*["'`][^"'`]*scale\(\s*(?:0?\.\d+|var\()|scale\s*:\s*["'`](?:0?\.\d+|var\())/i;
  if (inlineScaleToFit.test(sourceText)) {
    fail("Inline scale-to-fit adaptation detected. Oversized existing pages must be split into state screens, not shrunk as one surface.");
  }
}

function checkStateSplitForLegacy(sourceText) {
  const hasIntro = /\b(?:intro|menu|start|onboarding)\b/i.test(sourceText);
  const hasPlaying = /\bplaying\b/i.test(sourceText);
  const hasResult = /\bresult\b/i.test(sourceText);
  if (!hasIntro || !hasPlaying || !hasResult) {
    fail("Legacy/iframe adaptation must expose split states for oversized pages: intro/menu -> playing -> result. Do not publish a single crowded legacy page.");
  }
}

function checkRedLines() {
  const ignoredFiles = [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "runtime-contract-check.js",
    "waku-conformance-check.mjs",
  ];
  const scanText = [
    readAllText(sourceDir, {
      ignoredDirs: [".git", "node_modules", "public", "dist", "build", "out", "vendor", "scripts"],
      ignoredFiles,
    }),
    readAllText(siteDir, {
      ignoredDirs: ["vendor"],
      ignoredFiles,
    }),
  ].join("\n");

  const redLines = [
    /OPENAI_API_KEY/,
    /WAVESPEED_API_KEY/,
    /apiKey\s*[:=]/,
    /Authorization\s*[:=]/,
    /Bearer\s+[A-Za-z0-9._-]+/,
    /api\.openai/,
    /replicate\.com/,
    /\/v1\/llm/,
    /localhost/,
    /127\.0\.0\.1/,
  ];

  const hit = redLines.find((pattern) => pattern.test(scanText));
  if (hit) {
    fail(`Red-line scan matched ${hit}. Remove provider keys, direct AI endpoints, local services, and raw tokens before publishing.`);
  }
}

checkBuiltArtifact();
checkTemplateContract();
checkRedLines();

for (const issue of warnings) {
  console.warn(`WARN [${issue.code}] ${issue.message}`);
}

writeReport({
  ok: failures.length === 0,
  gate: "waku-conformance",
  sourceDir,
  siteDir,
  reportPath,
  checkedAt: new Date().toISOString(),
  failures,
  warnings,
  next_actions: nextActions(failures, { sourceDir, siteDir, reportPath }),
});

if (failures.length > 0) {
  console.error("Waku conformance check failed:");
  console.error(`Report: ${reportPath}`);
  for (const issue of failures) {
    console.error(`- [${issue.code}] ${issue.message}`);
    console.error(`  fix: ${issue.fix}`);
  }
  process.exit(1);
}

console.log("Waku conformance check passed.");
console.log(`Report: ${reportPath}`);

function writeReport(report) {
  try {
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    console.warn(`WARN [report.write-failed] Could not write conformance report: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function nextActions(issues, context) {
  if (issues.length === 0) return [];
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
      action: actionForCode(issue.code),
      fix: issue.fix,
      evidence: issue.evidence,
      rerun: {
        command: `node scripts/waku-conformance-check.mjs --source-dir ${shellQuote(context.sourceDir)} --site-dir ${shellQuote(context.siteDir)} --report ${shellQuote(context.reportPath)}`,
      },
    }));
}

function actionForCode(code) {
  const actions = {
    "artifact.invalid": "Rebuild the project and verify the generated site directory contains a Waku index.html and runtime vendor bundle.",
    "template.invalid": "Move the project into the bundled Waku session template before publishing.",
    "shell.invalid": "Restore the required template shell in src/App.* and src/index.css.",
    "safe-area.invalid": "Repair safe-area variables and place readable/tappable UI inside .safe-ui.",
    "legacy-iframe.unsafe": "Constrain or port legacy iframe UI so it lives inside the Waku safe area.",
    "layout.scale-to-fit": "Replace whole-page scaling with explicit intro/menu, playing, and result states.",
    "template-debug-ui.present": "Replace template demo/probe UI in the production App with the real playable UI.",
    "states.missing": "Split crowded legacy content into intro/menu, playing, and result states.",
    "runtime.red-line": "Remove provider credentials, localhost endpoints, direct AI calls, and raw tokens.",
    "test-contract.invalid": "Restore package.json and the template test contract.",
  };
  return actions[code] ?? "Fix the reported conformance issue, then rerun this gate.";
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
