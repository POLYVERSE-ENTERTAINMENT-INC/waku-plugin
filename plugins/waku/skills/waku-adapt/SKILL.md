---
name: waku-adapt
description: 把「已有的本地 web 游戏 / 互动内容」适配进 Waku 平台。核心是把游戏原来「自己直连 AI（OpenAI / WaveSpeed / 自有 gateway / fetch provider）」的调用，替换成 Waku 平台的 content-runtime SDK（window.Polyverse.ready() → pv.multimodal.generate），注入 runtime 包 + manifest，删掉所有 provider key / 直连 endpoint / 裸 token，并满足手机端约束，最后用 waku-cli 发布。触发于：我已有一个游戏要上平台 / 兼容到 Waku / 迁移 AI 调用 / 替换成 runtime.js / 把现成项目适配过来 / port existing game / migrate AI calls。
---

# Waku 适配（把已有游戏迁移进平台 · brownfield skill）

> 用户已经有一个本地游戏，要发布到 Waku。**不要重写业务逻辑，只替换 AI 调用层 + 套平台约束。** 从零创作走 `waku` skill；发布命令走 `waku-cli` skill。

一句话原则：**迁移不是把 provider endpoint 从 A 换成 B，而是把「游戏自己拥有 AI 后端」改成「游戏请求平台授予的 runtime capability」。** 平台负责鉴权、provider key、runtime token、配额、资产归属。

## 第 0 步：判定类型 + 保护原件

| 类型 | 是否要接 content-runtime | 处理 |
|---|---|---|
| 纯静态 playable（打开后不再调 AI） | 不需要 | 套当前 session template 的手机端 shell / safe-area 约束，再用 `waku-cli` 发布 |
| runtime AI 游戏（打开后还 `fetch(provider)` / `/generate` / `/chat`） | **需要** | 走下面全部步骤 |

判据：打开 HTML 后还会执行 `fetch(provider)`、`new OpenAI(...)`、`wavespeed.run(...)`、`/generate`、`/chat` 之类 = runtime AI 游戏。

**先在工作副本上改**，验证通过前不要动用户原件。适配不是只改 `base: "./"` 或把产物上传；若项目没有 `.bg-layer` / `.stage` / `.safe-ui`、manifest、runtime/probe/test 这些模板契约，必须把当前 session template 的 shell 合进去。不要把未模板化的普通 Vite/HTML 项目作为 Waku playable 发布。

“完整适配”的定义：业务玩法可以沿用，但页面结构必须真正进入 Waku 移动端布局契约。`.stage` 只放 full-bleed 世界/画布/背景；任何文字、按钮、HUD、结果、规则、表单、legacy HTML iframe 等可读可点 UI 必须在 `.safe-ui` / `.safe-center` 的安全区内。把旧页面整页塞进 `.stage` iframe 属于绕过约束，不算适配，不能发布。**不要要求已有游戏原项目自己遵守 Waku 约束；适配层必须兜底**：合入模板的 `src/index.css` safe-area 变量（`--runtime-safe-*`、`--waku-top-chrome`、`--waku-bottom-chrome`、`--safe-top`、`--safe-bottom`），并把 legacy iframe / ported HUD 布局到这些变量定义出的宿主安全区域内。

## 第 1 步：扫描原始 AI 调用点和密钥

```bash
rg -n "openai|wavespeed|replicate|stability|midjourney|apiKey|Authorization|Bearer|/generate|/chat|/image|/video|/v1/llm|fetch\(" .
```

把命中按能力归类：文生图/改图 → `pv.multimodal.generate`(image)；视频/音频 → 对应 capability；视觉 LLM（截图→JSON）→ `llm.chat.vision`；保存/读取生成资产 → `pv.assets.get`/`save`。

## 第 2 步：注入 runtime 包

`index.html` 里把平台 runtime bundle 放在游戏代码**之前**：

```html
<script src="./vendor/polyverse-content-runtime.min.js"></script>
<script type="module" src="./app.js"></script>
```

`vendor/polyverse-content-runtime.min.js` 取自平台模板（`polyverse-session-template-dev` 的 `static/vendor/`），不要从公网 CDN 随手引未知版本。最稳：先 `waku` skill 的方式脚手架一份模板，把它的 `static/vendor/`、build 配置、`src/waku/` adapter 骨架、`src/App.tsx` shell 结构和 `src/index.css` safe-area 变量拷进用户项目（这就是「把约束模板 merge 进已有游戏」——拷平台脚手架件 + codemod 调用点，不是 git 三方 merge）。

## 第 3 步：声明 manifest

```html
<script type="application/polyverse-manifest">
{
  "runtime": "@polyverse/content-runtime@1",
  "capabilities": ["multimodal.generate.image", "multimodal.jobs.read", "assets.read.own"]
}
</script>
```

**铁律**：`capabilities` 必须**穷举**代码实际用到的每一个 `pv.*` 调用（声明是全量替换不是叠加；漏一个那个调用就 403）。生成图/视频/音频一律要带 `multimodal.jobs.read` + `assets.read.own`（取生成结果 URL 要 `pv.assets.get`）。视觉 LLM 用 `llm.chat.vision`。

## 第 4 步：建一个薄 adapter，收口所有平台调用

不要在每个按钮回调里直接写 `window.Polyverse.ready()`。建一个独立文件：

```js
// src/waku/runtime-ai-adapter.js —— 唯一能调用 window.Polyverse 的地方
let clientPromise;
const pv = () => (clientPromise ??= window.Polyverse.ready());

export async function generateImage({ prompt }) {
  const c = await pv();
  const job = await c.multimodal.generate({
    capability: "multimodal.generate.image",
    modelId: "google/nano-banana-2/text-to-image",
    parameters: { prompt },
    wait: true,
  });
  const id = job.result_asset_ids?.[0] || job.resultAssetIds?.[0];
  if (id) { const a = await c.assets.get({ assetId: id }); return a.url || a.public_url; }
  return job.output_url || job.url || null;
}
```

游戏业务代码只依赖 `generateImage()` 这类业务函数；以后平台换 provider 只改 adapter。

## 第 5 步：codemod 替换调用点（有纪律地改）

把原来直连 provider 的调用换成调 adapter。**业界 codemod 纪律**：

- 优先按结构/AST 改，别只做文本替换（import alias 会漏）。
- **改不全 / 拿不准的，不要硬改**——在调用点插 `// TODO(waku-adapt): 手动确认此 AI 调用迁移` 并告诉用户，让人工兜底（参考 Next.js codemod：宁可留标记让 build 报错，也不静默改错）。
- 改完用 `git diff` 给用户过一遍。

## 第 6 步：删除直连 provider 调用和密钥（发布前必须清空）

```bash
rg -n "OPENAI_API_KEY|WAVESPEED_API_KEY|apiKey|Authorization|Bearer|api\.openai|wavespeed|replicate|/v1/llm|localhost|127\.0\.0\.1" .
```

artifact 里**不能**出现：provider key、直连 provider endpoint、用户 session/Firebase token、MCP token、本机 localhost AI 服务。（`wavespeed` 仅作为 `provider:"wavespeed"` 字符串出现在 adapter/manifest 里是允许的。）

## 第 7 步：处理状态 + fallback（运行时 AI 通常慢）

页面要显式处理 pending/queued（禁用按钮或进度态）、slow（提示仍在生成）、failed（可重试，别吞 Promise reject）、bridge unavailable（提示「请在 Polyverse 内打开」）。保留原 fallback 作失败兜底，但不能在输入为空/超时前抢先返回。

## 第 8 步：验收（不能只看「页面出了东西」）

静态自检：

```bash
rg -n "window\.Polyverse\.ready|polyverse-content-runtime|application/polyverse-manifest" .   # 必须命中
rg -n "OPENAI_API_KEY|Bearer|api\.openai|/v1/llm|127\.0\.0\.1" .                              # 必须为空
```

要求：artifact 有 `vendor/polyverse-content-runtime.min.js`；runtime 游戏有 `window.Polyverse.ready()` + manifest（至少声明 `capabilities`）；完整适配项目保留 `.bg-layer` / `.stage` / `.safe-ui` / `.safe-center`、`window.__WAKU_GAME__`、`window.__waku_debug`、preview state hooks 和 `npm run test` 机器底线；无 provider key / 用户 token / MCP token / 直连 provider 调用。

结构要求：如果为了迁移速度临时使用 iframe，iframe 只能作为 `.safe-ui` / `.safe-center` 内的有界组件存在，并且适配层必须保证 iframe 内可读/可点 UI 不会落入 Waku 宿主顶部/底部 chrome 保留区；不能把 iframe 放在 `.stage`。更推荐把原游戏 DOM/Canvas 迁入 React playable 组件，让 HUD、核心交互和结果面板自然受 safe-area 管理。若不能检查 iframe 内容（跨域、sandbox、动态注入导致不可读），不能发布。

适配模式三选一，按风险从低到高选择：

| 模式 | 用途 | 必须满足 |
|---|---|---|
| `react-port` | DOM/React 类游戏，推荐 | 把核心 UI/状态迁进 React playable 组件，HUD/按钮/结果都在 `.safe-ui` |
| `canvas-port` | Canvas/引擎类游戏 | Canvas/world 可在 `.stage`，HUD/按钮/结果必须在 `.safe-ui` |
| `legacy-iframe-safe` | 临时迁移单页 HTML | iframe 必须是 `.safe-ui/.safe-center` 内的有界组件，适配层必须用模板 safe-area / host-chrome 变量给 iframe 和其中 UI 留出顶部/底部保留区，并通过 nested visual check |

禁止模式：`stage-iframe`（旧页面整页 iframe 放进 `.stage`）、裸 `dist/` 上传、只补 manifest/runtime 但不处理 safe-area 的形式适配。

发布前还必须通过插件门禁：

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-conformance-check.mjs" --source-dir . --site-dir public
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png
```

在 Codex/local checkouts 中，如果 `CLAUDE_PLUGIN_ROOT` 未设置，用插件仓库里的绝对脚本路径。脚本失败就是 blocker：继续改到通过为止，不要绕过后直接 `waku publish` / `waku playground upload`。插件 launcher 发布前也会自动执行这两道门禁。通过后按 `waku-cli` skill 发布，并在平台里点一下真的生成验过。

不得用 `waku api` 直接上传 playable、改 deployment/publication 状态，或把 `preview_ready` 转成 `published`。上传前、发布前都必须走同一套 gate；预览上传用 `waku playground upload`，Feed 发布用 `waku publish`。

视觉验收是必需项，不是可选项：用移动视口（建议 `390x844`）检查 `.safe-ui`、游戏根节点、iframe/canvas、主要按钮和棋盘/核心交互区域的 bounding box。除了非文字的 full-bleed 世界层，核心可读/可点内容不得越出 `.safe-ui`，不得被宿主顶部/底部 chrome 遮挡；如果截图看起来仍像原裸页面，只是套了 runtime，就是失败。插件视觉脚本默认按模板契约模拟顶部 `56px`、底部 `82px` 宿主保留区，并检查 same-origin iframe 内的按钮、HUD、状态卡、提示和结果面板。

优先使用插件脚本生成证据：

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png
```

## 平台还没有的能力

迁移时若发现游戏需要的能力平台还没有（如通用 LLM chat、长视频），**不要在游戏里临时绕**：先把直连和密钥移除、保留 graceful fallback，把缺的 capability 记成平台 backlog，等平台补齐再接。
