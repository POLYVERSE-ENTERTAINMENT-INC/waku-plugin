export type WakuCapability =
  | "llm.chat.vision"
  | "multimodal.generate.image"
  | "multimodal.generate.video"
  | "multimodal.generate.audio"
  | "multimodal.transcribe.audio"
  | "multimodal.jobs.read"
  | "multimodal.models.read"
  | "leaderboard.read"
  | "leaderboard.write"
  | "player-storage.read"
  | "player-storage.write"
  | "assets.write"
  | "host.context.read"
  | "app.share.request"
  | "app.navigation.request"
  | "app.haptics.play"
  | "app.composer.open"
  | "app.comment.compose";

export interface WakuMultimodalGenerateRequest {
  capability: Extract<
    WakuCapability,
    | "multimodal.generate.image"
    | "multimodal.generate.video"
    | "multimodal.generate.audio"
    | "llm.chat.vision"
  >;
  provider?: string;
  modelId?: string;
  parameters: Record<string, unknown>;
  wait?: boolean;
}

// Terminal job shape: media results in result_asset_ids (resolve each id via
// assets.get → public_url); LLM text result in result_data.
export interface WakuMultimodalJob {
  id?: string;
  status?: string;
  result_asset_ids?: string[];
  result_data?: unknown;
}

export interface WakuHapticsRequest {
  style: "light" | "medium" | "heavy" | "success" | "warning" | "error";
}

export interface WakuPreviewStateInput {
  id: string;
  title: string;
  page?: string | number;
  description?: string;
  mock?: unknown;
  apply: () => void;
}

export interface WakuPlatformClient {
  multimodal?: {
    generate?(request: WakuMultimodalGenerateRequest): Promise<unknown>;
  };
  preview?: {
    registerStates?(states: WakuPreviewStateInput[]): unknown;
    reportState?(stateId: string): unknown;
  };
  app?: {
    haptics?: {
      play(request: WakuHapticsRequest): Promise<void> | void;
    };
    share?: {
      request?(payload: Record<string, unknown>): Promise<unknown>;
    };
    // Host comment composer. Legacy form {imageUrl} ≡ {content, kind:"image"};
    // the general form classifies by `kind` (auto → image only for an http(s)
    // image URL, else text). Text-only comments pass {content, kind:"text"}.
    composeComment?(payload: {
      imageUrl?: string;
      content?: string;
      kind?: "auto" | "image" | "text";
      text?: string;
    }): Promise<unknown>;
    navigation?: {
      request?(payload: Record<string, unknown>): Promise<unknown>;
    };
  };
  // Assets upload (capability: assets.write) — the host channel iOS uses for the
  // share-to-comments image path. Takes the rendered image bytes as a base64
  // STRING, persists them to a permanent public GCS URL, and returns a record
  // carrying that http(s) URL. Distinct from storage.upload (player-storage): use
  // this for "turn a result card into a shareable link", per the content-runtime
  // recommended flow canvas → base64 → assets.upload → composeComment.
  assets?: {
    upload?(data: string, options?: Record<string, unknown>): Promise<unknown>;
    // Resolve a generated asset id to a record carrying its public http(s) URL
    // (capability: assets.read.own). Media generation jobs return ids, not URLs.
    get?(input: { assetId: string }): Promise<unknown>;
  };
  storage?: {
    save?(key: string, value: unknown): Promise<unknown>;
    load?(key: string): Promise<unknown>;
    publish?(id: string): Promise<unknown>;
  };
  leaderboard?: {
    submitScore?(payload: Record<string, unknown>): Promise<unknown>;
    getTop?(payload: Record<string, unknown>): Promise<unknown>;
  };
}

export async function readyWakuRuntime(): Promise<WakuPlatformClient> {
  if (!window.Polyverse?.ready) {
    throw new Error("WAKU content runtime is not available. Ensure static/vendor/polyverse-content-runtime.min.js loads before app code.");
  }
  return (await window.Polyverse.ready()) as WakuPlatformClient;
}

// Register inspectable preview states; the host renders a state bar and can
// goto/freeze them. Additive — silently skipped on a missing/old host.
export async function registerWakuPreviewStates(states: WakuPreviewStateInput[]) {
  try {
    const client = await readyWakuRuntime();
    client.preview?.registerStates?.(states);
  } catch {
    // Preview inspector is additive; the playable must keep working without it.
  }
}

// Report the current phase as play advances; the host highlights it on the track.
// Additive — silent on a missing/old host or unregistered id.
export async function reportWakuPreviewState(stateId: string) {
  try {
    const client = await readyWakuRuntime();
    client.preview?.reportState?.(stateId);
  } catch {
    // Preview phase reporting is additive; the playable must keep working without it.
  }
}

// Vibration API fallback patterns (ms), mapped per haptic style. Used only when
// the host has no native haptics channel (covers Android Chrome + the simulator;
// iOS WebView ignores navigator.vibrate but its host always provides haptics).
const VIBRATE_PATTERN: Record<WakuHapticsRequest["style"], number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 35,
  success: [12, 40, 18],
  warning: [20, 60, 20],
  error: [35, 50, 35, 50, 35],
};

// Robust haptic: prefer the host's native haptics channel; fall back to the Web
// Vibration API. Never throws — feedback is additive, its absence is harmless.
export async function playWakuHaptic(style: WakuHapticsRequest["style"] = "light") {
  try {
    const client = await readyWakuRuntime();
    if (client.app?.haptics?.play) {
      await client.app.haptics.play({ style });
      return;
    }
  } catch {
    // host unavailable → fall through to navigator.vibrate
  }
  try {
    navigator.vibrate?.(VIBRATE_PATTERN[style]);
  } catch {
    // no vibration support; silently no-op
  }
}

// Share to comments (the platform's only share channel, app.comment.compose).
// Default is text-only: post this run's real result as text — most robust, always
// works. Pass imageUrl only for a per-player result card: it must be a public
// http(s) URL (≤2048 chars) from uploadImageForShare(); data URLs are rejected on
// post. Both only open a draft the player confirms. Never pass a bundled decorative
// asset as imageUrl — that isn't this player's result.
export async function composeWakuComment(text: string, imageUrl?: string) {
  const client = await readyWakuRuntime();
  if (!client.app?.composeComment) {
    throw new Error("Comment composer is unavailable in this host.");
  }
  if (imageUrl) {
    return client.app.composeComment({ imageUrl, text });
  }
  return client.app.composeComment({ content: text, kind: "text" });
}

// Find the first http(s) URL anywhere in a response, robust to whatever field
// the host returns (url / public_url / signed_url / …).
function findHttpUrl(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") return /^https?:\/\//.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const u = findHttpUrl(v, depth + 1);
      if (u) return u;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["public_url", "publicUrl", "url", "signed_url", "download_url", "downloadUrl", "href"]) {
      const v = obj[key];
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
    for (const v of Object.values(obj)) {
      const u = findHttpUrl(v, depth + 1);
      if (u) return u;
    }
  }
  return null;
}

// Optional half of the image-share path: upload a rendered card (data URL, e.g.
// from renderResultCard) and return a permanent public http(s) URL for
// composeWakuComment. Goes through pv.assets.upload — the same host channel the
// latest iOS app uses — which takes the image as a base64 STRING and returns a
// record carrying a public GCS URL (the only image form the comment composer
// accepts; data URLs are rejected). The mime type / extension are read back from
// the data URL itself (WebP when the WebView could encode it, else PNG) so the
// uploaded bytes are always labeled correctly. Returns null on any failure so
// callers can fall back to text-only. Requires manifest assets.write.
export async function uploadImageForShare(imageDataUrl: string): Promise<string | null> {
  try {
    if (!imageDataUrl.startsWith("data:")) return null;
    const comma = imageDataUrl.indexOf(",");
    if (comma < 0) return null;
    const base64 = imageDataUrl.slice(comma + 1);
    if (!base64) return null;
    const mimeType = imageDataUrl.slice(5, comma).split(";")[0] || "image/png";
    const ext = mimeType === "image/webp" ? "webp" : "png";
    const client = await readyWakuRuntime();
    if (!client.assets?.upload) return null;
    const res = await client.assets.upload(base64, { filename: `result-card.${ext}`, mimeType });
    return findHttpUrl(res);
  } catch {
    return null;
  }
}

export async function generateWithWakuRuntime(request: WakuMultimodalGenerateRequest) {
  const client = await readyWakuRuntime();
  if (!client.multimodal?.generate) {
    throw new Error("WAKU multimodal generation is unavailable in this host.");
  }
  return client.multimodal.generate(request);
}

// Dig out the first usable text field from an LLM job's result_data, robust to
// whatever shape the provider returns ({content} / {text} / OpenAI-style
// {choices:[{message:{content}}]} / a bare string).
function findText(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = findText(v, depth + 1);
      if (s) return s;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["text", "content", "message", "output_text", "output", "response", "completion"]) {
      const s = findText(obj[key], depth + 1);
      if (s) return s;
    }
    for (const v of Object.values(obj)) {
      const s = findText(v, depth + 1);
      if (s) return s;
    }
  }
  return null;
}

// ── Runtime connectivity probes ────────────────────────────────────────────
// Two minimal round-trips that exercise the in-content AI capabilities end to
// end (content → pv.multimodal.generate → backend → result). They send a fixed
// payload and surface the raw result so a host preview can show "runtime AI
// reachable / not reachable". Real content uses the same generate() path with
// its own prompts; see reference/runtime-js.md.

// An identifiably-real reply (not a canned echo) so a human can confirm the text
// genuinely came from the model: it must contain the arithmetic result (42).
const LLM_PROBE_PROMPT =
  "Reply in one short, friendly sentence that confirms the WAKU runtime LLM is working and states the result of 17 + 25.";

// LLM probe (llm.chat.vision): returns the model's text. Needs manifest
// llm.chat.vision + multimodal.jobs.read.
export async function probeWakuLLM(): Promise<string> {
  const job = (await generateWithWakuRuntime({
    capability: "llm.chat.vision",
    provider: "openrouter",
    modelId: "openai/gpt-4.1-mini",
    parameters: { prompt: LLM_PROBE_PROMPT },
    wait: true,
  })) as WakuMultimodalJob;
  const text = findText(job.result_data);
  if (!text) throw new Error("LLM job returned empty result_data");
  return text;
}

// Image probe (multimodal.generate.image): returns the generated image's public
// http(s) URL. Needs manifest multimodal.generate.image + multimodal.jobs.read +
// assets.read.own (the job yields an asset id, resolved via pv.assets.get).
export async function probeWakuImage(): Promise<string> {
  const job = (await generateWithWakuRuntime({
    capability: "multimodal.generate.image",
    provider: "wavespeed",
    modelId: "bytedance/seedream-v4.5",
    parameters: { prompt: "a single small green leaf, flat minimal icon, plain off-white background" },
    wait: true,
  })) as WakuMultimodalJob;
  const assetId = job.result_asset_ids?.[0];
  if (!assetId) throw new Error("image job returned no result_asset_ids");
  const client = await readyWakuRuntime();
  if (!client.assets?.get) throw new Error("assets.get unavailable (declare assets.read.own)");
  const asset = await client.assets.get({ assetId });
  const url = findHttpUrl(asset);
  if (!url) throw new Error("could not resolve image public_url from asset record");
  return url;
}
