import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const html = read("index.html");
const manifest = readManifest(html);
const capabilityReference = readCapabilityReference(html);

const runtimeScriptIndex = html.indexOf("vendor/polyverse-content-runtime.min.js");
const appScriptIndex = html.indexOf("src/main.tsx");

assert.ok(runtimeScriptIndex >= 0, "index.html must load the Polyverse runtime bundle");
assert.ok(appScriptIndex >= 0, "index.html must load the React app entry (src/main.tsx)");
assert.ok(runtimeScriptIndex < appScriptIndex, "runtime bundle must load before app code");
assert.match(html, /<div\s+id=["']root["']><\/div>/, "index.html must expose React root #root");

assert.equal(typeof manifest.runtime, "string", "manifest.runtime must be a top-level string");
assert.ok(Array.isArray(manifest.capabilities), "manifest.capabilities must be an array");
assert.equal(
  Object.prototype.hasOwnProperty.call(manifest, "requestedCapabilities"),
  false,
  "new source must use capabilities, not requestedCapabilities",
);
// Validate every declared capability against the known platform vocabulary instead
// of pinning an exact list. Pinning forced an edit to this file on every single run
// (each content declares a different real capability set) — pure rework with no value.
// Correctness still enforced: unknown/typo'd/invented capabilities fail; the
// jobs.read implication is checked below. Whether a declared capability is actually
// called is the author's responsibility, verified by the browser smoke, not here.
const knownCapabilities = new Set([
  ...capabilityReference.capabilities.map((c) => c.id),
  "assets.read.own", // platform-valid, not listed in the reference block
]);
for (const cap of manifest.capabilities) {
  assert.ok(
    knownCapabilities.has(cap),
    `manifest declares unknown capability "${cap}" — not in the platform capability vocabulary`,
  );
}

const jobBackedCapabilities = new Set([
  "multimodal.generate.image",
  "multimodal.generate.video",
  "multimodal.generate.audio",
  "multimodal.transcribe.audio",
  "llm.chat.vision",
]);
const needsJobRead = manifest.capabilities.some((capability) => jobBackedCapabilities.has(capability));
if (needsJobRead) {
  assert.ok(
    manifest.capabilities.includes("multimodal.jobs.read"),
    "AI jobs that wait or poll must declare multimodal.jobs.read",
  );
}

assert.equal(capabilityReference.referenceOnly, true, "capability reference must be marked referenceOnly");
assert.ok(Array.isArray(capabilityReference.capabilities), "capability reference must list capabilities");
for (const expected of [
  "llm.chat.vision",
  "multimodal.generate.image",
  "multimodal.generate.video",
  "multimodal.generate.audio",
  "multimodal.transcribe.audio",
  "multimodal.jobs.read",
  "multimodal.models.read",
  "leaderboard.read",
  "leaderboard.write",
  "player-storage.read",
  "player-storage.write",
  "assets.write",
  "host.context.read",
  "app.share.request",
  "app.navigation.request",
  "app.haptics.play",
  "app.composer.open",
  "app.comment.compose",
]) {
  assert.ok(
    capabilityReference.capabilities.some((capability) => capability.id === expected),
    `capability reference must include ${expected}`,
  );
}

const pkg = JSON.parse(read("package.json"));
assert.ok(pkg.dependencies?.react, "template must depend on React");
assert.ok(pkg.dependencies?.["react-dom"], "template must depend on react-dom");
assert.ok(pkg.devDependencies?.tailwindcss, "template must depend on Tailwind CSS");
assert.ok(pkg.devDependencies?.["@vitejs/plugin-react"], "template must use the React Vite plugin");
assert.ok(pkg.devDependencies?.["@tailwindcss/vite"], "template must use the Tailwind Vite plugin");

const bundlePath = join(root, "static", "vendor", "polyverse-content-runtime.min.js");
assert.ok(existsSync(bundlePath), "vendor runtime bundle must exist under static/vendor");
assert.ok(statSync(bundlePath).size > 20_000, "vendor runtime bundle looks too small");
assert.match(readFileSync(bundlePath, "utf8"), /Polyverse/);

for (const sourceFile of [
  "index.html",
  "src/main.tsx",
  "src/App.tsx",
  "src/playable/DefaultPlayable.tsx",
  "src/playable/usePlayableState.ts",
  "src/waku/polyverse.ts",
  "src/lib/i18n.ts",
  "src/lib/audio.ts",
  "src/lib/gestures.ts",
]) {
  const source = read(sourceFile);
  assert.doesNotMatch(
    source,
    /VITE_MUSE_GATEWAY_URL|VITE_MUSE_RUNTIME_TOKEN|\/v1\/llm\/chat|\/v1\/image\/generate|OPENROUTER_API_KEY|WAVESPEED_API_KEY|MCP_TOKEN|Authorization:\s*Bearer/i,
    `${sourceFile} must not ship old gateway endpoints or credentials`,
  );
}

const app = read("src/App.tsx");
assert.match(app, /className=["']bg-layer["']/, "src/App.tsx must hard-code .bg-layer in the template shell");
assert.match(app, /className=["']safe-ui["']/, "src/App.tsx must hard-code .safe-ui in the template shell");
assert.doesNotMatch(app, /\.\/components\//, "src/App.tsx must not import template-owned shell from src/components/");
assert.doesNotMatch(
  app,
  /RuntimeProbe|DeviceProbe|GestureHintShowcase/,
  "src/App.tsx must not render template-only visible debug/smoke UI in the default production path",
);



const componentsReadme = read("src/components/README.md");
assert.ok(componentsReadme.includes("generated") && componentsReadme.includes("MCP"), "src/components/README.md must document generated/MCP ownership");

const css = read("src/index.css");
for (const requiredSelector of [".bg-layer", ".stage", ".safe-ui", ".safe-center", ".core-target"]) {
  assert.ok(css.includes(requiredSelector), `src/index.css must keep ${requiredSelector}`);
}

// Import-guard: the skeleton lives pre-installed in src/lib/vendor/. A copy of any of
// those modules elsewhere in src/ means the run re-derived/duplicated it instead of
// importing — the recurring distribution bug. Import from src/lib/vendor/<slug>; don't copy.
const vendoredSlugs = [
  "juice-fx-layer", "seeded-verdict-bank", "responsive-canvas-stage",
  "result-card-canvas-toolkit", "media-element-audio", "fixed-step-game-loop",
  "seeded-random-utils", "score-combo-tracker", "archetype-typing-kit",
];
for (const slug of vendoredSlugs) {
  for (const wrong of [`src/lib/${slug}.ts`, `src/engine/${slug}.ts`, `src/${slug}.ts`]) {
    assert.ok(
      !existsSync(join(root, wrong)),
      `"${wrong}" duplicates the pre-installed src/lib/vendor/${slug}.ts — import from src/lib/vendor/, don't copy it`,
    );
  }
}

console.log("runtime contract ok");

const playableSource = read("src/playable/usePlayableState.ts");
assert.ok(
  playableSource.includes("registerWakuPreviewStates("),
  "playable must register preview states (pv.preview.registerStates via src/waku adapter)",
);
for (const stateId of ['id: "ready"', 'id: "playing"', 'id: "result"']) {
  assert.ok(
    playableSource.includes(stateId),
    `preview states must declare entry/core-loop/result (missing ${stateId})`,
  );
}

assert.ok(
  playableSource.includes("reportWakuPreviewState("),
  "playable must report phase changes (pv.preview.reportState via src/waku adapter) so the host rail follows manual play",
);

const vendorBundle = read("static/vendor/polyverse-content-runtime.min.js");
assert.ok(
  vendorBundle.includes("__hostEvent"),
  "vendored runtime bundle must support the host event channel (preview.state.goto/freeze)",
);
assert.ok(
  vendorBundle.includes("reportState") && vendorBundle.includes("preview.state.changed"),
  "vendored runtime bundle must support phase reporting (pv.preview.reportState -> preview.state.changed)",
);

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readManifest(source) {
  const match = source.match(
    /<script\s+type=["']application\/polyverse-manifest["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  assert.ok(match, "index.html must include application/polyverse-manifest");
  return JSON.parse(match[1]);
}

function readCapabilityReference(source) {
  const match = source.match(
    /<script\s+type=["']application\/json["']\s+id=["']polyverse-capability-reference["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  assert.ok(match, "index.html must include polyverse-capability-reference");
  assert.match(match[0], /data-reference-only=["']true["']/i);
  return JSON.parse(match[1]);
}
