---
name: waku-cli
description: Waku CLI 操作手册——用 `waku` 命令完成 Playable 的整个发布生命周期：登录、发布到 Feed、可分享 preview、拉回本地二次编辑、重新发布、取消发布、删除项目，以及发布前的平台合规自检。创作内容怎么搭见 `waku` skill；把已有游戏适配进平台见 `waku-adapt` skill。触发于：发布 / publish / 上传 / 下载 / 二次编辑 / republish / 取消发布 / unpublish / 删除项目 / waku login / waku 命令 / 发到 feed。
---

# Waku CLI 操作手册（操作 skill）

这个 skill 教 agent 用 `waku` 命令把一个**已经做好的** Playable 走完发布生命周期。`waku` 命令由本插件的启动器自动装好（首次会话自动 `curl install.sh` 到 `~/.waku`）；命令复用 `waku login` 写的本地凭证并自动续期。

## 登录（一次，长期有效）

```bash
waku whoami          # 查登录态；失败=未登录
waku login           # 打开浏览器到 Waku 网站登录；成功存 ~/.config/waku/auth.json，自动续期
```

规则：**只在命令真正需要鉴权且 `whoami` 失败时**才提示登录，不要每次都喊登录。登录一次后 session 会静默续期，长期保持已登录。

## 发布前自检（平台合规契约）

发布前先过这份契约（难以工具强制的也要 agent 主动查）：

```bash
# 红线扫描：artifact 里绝不能出现 provider key / 直连 AI / 本地地址 / 裸 token
rg -n "OPENAI_API_KEY|WAVESPEED_API_KEY|apiKey|Authorization|Bearer|api\.openai|wavespeed|replicate|/v1/llm|/generate|/chat|localhost|127\.0\.0\.1" .
```

| 检查点 | 要求 |
|---|---|
| 运行时 AI | 全部经 `window.Polyverse.ready()` → `pv.multimodal.generate`，收口在薄 adapter（`src/waku/`）；无直连 provider |
| manifest | `index.html` 有 `<script type="application/polyverse-manifest">`，`capabilities[]` 与实际 `pv.*` 调用一一对应 |
| runtime 包 | `index.html` 在 app 代码前加载 `vendor/polyverse-content-runtime.min.js` |
| 红线 | 无 provider key / 直连 endpoint / session·MCP token / localhost AI（上面 `rg` 必须为空）|
| 手机端 | 竖屏、触摸完成核心循环、安全区合规、有结果 / 失败 + 重玩；新/完整模板项目保留 `.bg-layer` / `.stage` / `.safe-ui`；`src/index.css` 必须使用 `--runtime-safe-*`、`--waku-top-chrome`、`--waku-bottom-chrome`、`--safe-top`、`--safe-bottom` |
| build | 优先 `npm install && npm run test`（模板项目会产出 `public/` 并跑契约检查）；已有普通项目没有 `test` 脚本时，不得直接发布，先走 `waku-adapt` 合入模板契约 |

已有项目发布门禁：`waku publish` / `waku playground upload` 前必须通过插件脚本：

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-conformance-check.mjs" --source-dir . --site-dir public --report waku-conformance-report.json
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png --report waku-visual-report.json
```

在 Codex/local checkouts 中，如果 `CLAUDE_PLUGIN_ROOT` 未设置，用插件仓库里的绝对脚本路径。脚本失败时要先读取 JSON 报告里的 issue code、证据和建议修复，再继续适配；不要退回“普通静态托管”式上传。

插件里的 `bin/waku` 会在调用真实 CLI 前自动执行 conformance + mobile visual host-chrome 两道门禁；手动运行脚本是为了提前看到失败原因；失败会写出 waku-conformance-report.json 或 waku-visual-report.json。不要用真实 CLI 路径绕过插件 launcher。视觉门禁会模拟 Waku 顶部/底部宿主控件，并钻进 same-origin iframe 检查其中按钮、状态卡、提示、面板等可读/可点元素。

禁止用 `waku api` 做 playable 上传、deployment/publication 状态切换、`preview_ready` → `published` 这类发布链路写操作；这些写操作会绕过本地门禁。插件 launcher 会拒绝疑似上传/发布状态 mutation 的 `waku api` 调用。需要上传预览用 `waku playground upload`，需要发 Feed 用 `waku publish`。

## 发布到 Feed（首发）

`waku publish` 发布**已经 build 好且通过 conformance gate** 的静态目录（CLI 不替你 build），绑到用户自己的账号：

```bash
npm install && npm run test
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-conformance-check.mjs" --source-dir . --site-dir public --report waku-conformance-report.json
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png --report waku-visual-report.json
waku ls  # 首发新项目必须先查同名；同名 publish 会覆盖已有项目最新版
waku publish --name "Pocket Beat" --site-dir public --description "A rhythm tap game"
```

成功后只把 `content_id` / `preview_url` 报告给用户。同一用户重复发布同名游戏 = 更新同一项目的最新版本，不会创建第二个同名项目。用户要“创建/上传新项目”时，名称已存在就换唯一名称或先征得用户明确同意；只有用户明确要求覆盖/republish 时才允许同名发布。

插件 launcher 也会做同名保护：不在 pulled 目录、且未设置 `WAKU_ALLOW_SAME_NAME_UPDATE=1` 时，发现同名项目会拒绝首发，避免误更新旧项目。

## 可分享 Preview（不进 Feed）

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-conformance-check.mjs" --source-dir . --site-dir public --report waku-conformance-report.json
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png --report waku-visual-report.json
waku playground upload --name "Debug build" --site-dir public --source-dir .
```

返回 `playground_url` / `deployment_id`，用于分享预览或调试，不发 Feed。

## 二次编辑（pull → 改 → republish）

把一个已发布项目拉到本地、改、再发回去**顶替当前版**（旧版保留可回滚，Feed 位次不动）：

```bash
waku ls                       # 列出你的项目，找到要改的那个
waku pull "我的游戏"          # 或 waku pull <project_id>；拉源码到新子目录 + 写 .waku/project.json
# ... 改 src/ ...
npm install && npm run test   # 模板项目：检查契约并产出 public/
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-conformance-check.mjs" --source-dir . --site-dir public --report waku-conformance-report.json
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png --report waku-visual-report.json
waku publish                  # 在 pulled 目录里零参运行 = 原地 republish 这个项目
```

要点：
- pulled 目录里有 `.waku/project.json`，`waku publish` 自动识别成 republish（同项目新版、repoint、`published_at` 不动）。
- 不在 pulled 目录里时，不要用已有项目名发布新内容；先 `waku ls` 查重，避免误把新项目发成旧项目新版。
- 一条 `waku publish` 同时发产物（`public/`，给玩家）+ 源码（供下次 pull），后端原子收口。
- CLI **不替你 build**——必须先跑 `npm run test`（模板项目）或至少 `npm run build` 产出 `public/`，否则报错。

## 取消发布 / 删除项目

```bash
waku unpublish "<name-or-id>"   # 从 Feed 撤下（项目与历史版本保留）
waku delete    "<name-or-id>"   # 删除项目
```

> 若当前 CLI 版本还没有 `unpublish` / `delete` 子命令（旧版），先 `waku update` 升级；仍不可用时告知用户该能力正在发布中，不要伪造结果。

## 接入多模态 MCP（一般无需手动）

本插件已通过 `.mcp.json` 自动注册 Waku 多模态工具（`waku mcp serve`，零 token、按需签、复用登录）。需要手动给别的本地宿主注册时：

```bash
waku mcp add        # 注册到 Claude Code
waku mcp remove     # 移除
```

## 失败排查

| 现象 | 优先检查 |
|---|---|
| 提示未登录 / 401 | `waku login` |
| 浏览器没打开 | 把终端打印的登录 URL 手动粘到浏览器 |
| `entrypoint_not_found` | 检查 `--site-dir` 下有入口文件，或传 `--entrypoint` |
| publish 报缺 `public/` | 先 `npm run test`；无 test 脚本时跑 `npm run build` |
| Feed 没出现 | 确认 `waku publish` 成功返回 `content_id` / `preview_url`，且客户端连的是同一环境 |
