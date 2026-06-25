# WAKU Runtime JS（content-runtime SDK 调用）

Generated playable 在**运行时**调用平台能力（内容内 AI、排行榜、存档、host、app、媒体）走 content-runtime SDK。把这些调用收在 `src/waku/` adapter 后面，让组件和内容循环不直接依赖 host bridge 细节。

## 加载与入口

`index.html` 先加载 runtime bundle，再加载 app code：

```html
<script type="application/polyverse-manifest">
{"runtime":"@polyverse/content-runtime@1","capabilities":[]}
</script>
<script src="./vendor/polyverse-content-runtime.min.js"></script>
```

全局只挂 `window.Polyverse`，两个入口：

```ts
// iOS 内嵌宿主 / web 已 bootstrap：
const pv = await window.Polyverse.ready();

// web 独立站（自助换 token）：
const pv = await window.Polyverse.bootstrapWebRuntime({ apiBaseUrl, projectId, capabilities });
```

`ready()` 返回的 client 有 8 个能力命名空间——`multimodal` / `storage` / `leaderboard` / `host` / `app` / `media` / `project` / `assets`，外加 `capabilities`（`list()` / `has(id)`）和元数据（`pv.environment` = `ios_bridge`|`web`|`unavailable`、`pv.manifest`、`pv.requestedCapabilities`）。

> 在 session 模板里，`src/waku/polyverse.ts` 自带一个 thin wrapper（`readyWakuRuntime()` 内部就是 `await window.Polyverse.ready()`）——复用它即可；脱离模板时直接用 `window.Polyverse.ready()`。

## Manifest

manifest 在 `index.html` 的 `<script type="application/polyverse-manifest">`，`capabilities` 必填、必须是 `string[]`。

**铁律：capabilities 必须和代码实际调用的 SDK 方法一一对应。每加一个 `pv.xxx` 平台调用，就回 `index.html` 的 manifest 把对应 capability 加进 `capabilities`——调了却不声明，设备端 bridge 会用 `capability_not_declared` 拒掉该调用（空 `capabilities` = 一个平台能力都调不了）。** 没调的别声明。

**同样关键：声明是「全量替换」，不是「叠加」。** `capabilities` 一旦非空，session 被授予的就**只有你列出的这些**——默认能力全部失效。所以清单必须**穷举**代码用到的每一个 capability；漏一个（比如生成图后用 `pv.assets.get` 换 URL 却没列 `assets.read.own`），那个调用就会 403 `capability_denied`。

调用 → 必须声明：
- `pv.multimodal.generate({capability:"multimodal.generate.image"})` → 加 `"multimodal.generate.image"` + `"multimodal.jobs.read"`（generate 类一律带 `jobs.read`，因为 wait/poll 要读 job）+ **`"assets.read.own"`**（拿生成结果的图片 URL 必须 `pv.assets.get`，见下）
- 其他生成类：把 image 换成 `.video` / `.audio` / `multimodal.transcribe.audio` / `llm.chat.vision`（媒体类同样要 `assets.read.own`；纯文本 `llm.chat.vision` 不用）
- `pv.leaderboard.*` → `leaderboard.read`/`write`；`pv.storage.*` → `player-storage.read`/`write`；`pv.host.*` → 对应 `host.*.read`

可选 `allowedProviders` / `allowedModels`（数组）。manifest 是**请求意图**：宿主按 session 实际授予的能力比对，可拒绝或降级。

## 内容内 AI（multimodal）

5 个生成类 capability（`multimodal.generate.image` / `.video` / `.audio`、`multimodal.transcribe.audio`、`llm.chat.vision`）**都走同一个 `generate`**，靠 `capability` 字段区分，没有独立的 `pv.llm.*` / `pv.transcribe.*` 方法。

**读结果分两类，字段完全不同——别搞混：**

**① 图片 / 视频 / 音频生成（media 类）**：成功的 job 把产物落成**平台 asset**，URL **不在** `result_data` 里（`result_data` 只为 LLM 文本生成）。正解是拿 `result_asset_ids` 去 `pv.assets.get` 换 `public_url`：

```ts
const pv = await window.Polyverse.ready();
const job = await pv.multimodal.generate({
  capability: "multimodal.generate.image",  // 必填
  modelId: "bytedance/seedream-v4.5",       // 必填
  parameters: { prompt },                   // 必填（object）
  wait: true,                               // 内部转 waitForResult，返回终态 job
});
const assetId = (job.result_asset_ids ?? job.resultAssetIds ?? [])[0];
if (!assetId) throw new Error("no_result_asset");
const asset = await pv.assets.get({ assetId });   // manifest 必须声明 assets.read.own
const imageUrl = asset.public_url;                 // 渲染用这个
```

不要从 `result_data.url / image_url / images` 里找图——那些字段**不存在**；也不要自己拿 `result_asset_ids` 拼 CDN URL。

**② LLM 文本（`llm.chat.vision`）**：读 `result_data`：

```ts
const job = await pv.multimodal.generate({
  capability: "llm.chat.vision",
  modelId: "openai/gpt-4.1-mini",
  parameters: { prompt, images },
  wait: true,
});
// result_data 是正字段；provider_payload 仅作 backend 原始 payload 的历史兜底
const text =
  job.result_data?.text ||
  job.resultData?.text ||
  job.provider_payload?.result?.choices?.[0]?.message?.content ||
  "";
```

其他方法：`searchModels({query,provider,modelType,limit})`、`getModelSchema({modelId,provider})`、`getJob({jobId,refresh})`、`waitForResult({jobId,timeoutMs=120000,pollIntervalMs=1500})`。`MultimodalJob` 形状：`{id,status,provider,modelId,result_asset_ids,result_data?}`。

规则：
- `wait:true` 或自己轮询都需要 manifest 声明 `multimodal.jobs.read`。
- UI 必须有 waiting / timeout / retry-cancel / empty-result / success 五种分支。
- AI 结果可生成内容，但游戏完成、计分、安全转场由**本地 state** 决定，不交给 AI 输出。

## 排行榜与存档

```ts
await pv.storage.save(slot, data);   // 位置参数；返回 {id,slot,size_bytes,updated_at}
const data = await pv.storage.load(slot);

await pv.leaderboard.submitScore({ score, subscore, metadata, leaderboard }); // score 必填(number)
const top  = await pv.leaderboard.getTop({ period, limit, offset, leaderboard });
const mine = await pv.leaderboard.getMyRank({ period, leaderboard });
```

manifest 声明：`["leaderboard.read","leaderboard.write","player-storage.read","player-storage.write"]`。`localStorage` 只是离线缓存分支，**不满足**平台存储。

（storage 另有 `upload/get/list/delete/publish/unpublish/share/shareBatch/unshare/loadShared/listPublished`；leaderboard 另有 `getAroundMe` —— 需要时查类型。）

## Host / App / Media / Project / Assets

```ts
const ctx = await pv.host.context();        // 另有 pv.host.theme() / pv.host.safeArea()
await pv.app.haptics.play({ style });        // style 取值按宿主验证（light/medium/heavy/...）
await pv.app.share({ title, text, url });
await pv.app.navigate({ ... });              // 方法名是 navigate（capability 字符串才叫 app.navigation.request）
await pv.app.openComposer({ ... });

await pv.media.pickPhoto();                  // pickVideo() / capture() / recordAudio()
await pv.project.publish();                  // update()
await pv.assets.get({ assetId });            // save({ url|assetId, filename, mimeType, metadata })
```

## Capability 清单（闭集，未知 capability 后端直接 400）

授予语义：**manifest `capabilities` 为空 → 给默认集；非空 → 授予的就是你列的清单本身（全量替换默认集，不叠加）**。所以一旦声明，就把代码用到的每个 capability 都列全，「默认集」只对空声明有意义。

**默认集**（仅当 `capabilities: []` 时授予）：`host.context.read`、`host.theme.read`、`host.safeArea.read`、`app.share.request`、`app.haptics.play`、`multimodal.models.read`、`multimodal.generate.image|video|audio`、`multimodal.transcribe.audio`、`llm.chat.vision`、`multimodal.jobs.read`、`assets.read.own`、`assets.write`、`leaderboard.read|write`、`player-storage.read|write`。

**任何情况下都必须显式声明才有**（不在默认集）：`app.navigation.request`、`app.composer.open`、`media.photo.pick`、`media.video.pick`、`media.camera.capture`、`media.microphone.record`、`project.publish.request`、`project.update.request`。

## 失败处理

每个 SDK 调用都要有可见分支：capability denied / timeout / empty result / parse failure / retry-cancel / 有意义时 offline-local fallback。不要把用户卡在永久 loading，也不要用无关的成功态吞掉失败。
