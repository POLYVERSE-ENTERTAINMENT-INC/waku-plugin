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

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
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
    fail("Missing template.json. New and adapted Waku projects must be created from the bundled plugin template via `waku template copy <dir>`; do not hand-write a replacement shell.");
  } else {
    try {
      const meta = JSON.parse(readText(templateMetaPath));
      if (meta.id !== "polyverse-session-template-dev" || meta.source !== "bundled") {
        fail("template.json does not identify the bundled Waku session template. Recreate the project with `waku template copy <dir>` and migrate the content into it.");
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

  checkAdaptationStructure();

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

function checkAdaptationStructure() {
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

for (const message of warnings) {
  console.warn(`WARN ${message}`);
}

if (failures.length > 0) {
  console.error("Waku conformance check failed:");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("Waku conformance check passed.");
