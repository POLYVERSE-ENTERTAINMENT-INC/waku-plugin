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
| 手机端 | 竖屏、触摸完成核心循环、安全区合规、有结果 / 失败 + 重玩；新/完整模板项目保留 `.bg-layer` / `.stage` / `.safe-ui` |
| build | 优先 `npm install && npm run test`（模板项目会产出 `public/` 并跑契约检查）；没有 `test` 脚本时才退到 `npm run build` + 最强可用本地检查 |

## 发布到 Feed（首发）

`waku publish` 发布**已经 build 好**的静态目录（CLI 不替你 build），绑到用户自己的账号：

```bash
npm install && npm run test
waku publish --name "Pocket Beat" --site-dir public --description "A rhythm tap game"
```

成功后只把 `content_id` / `preview_url` 报告给用户。同一用户重复发布同名游戏 = 更新同一项目的最新版本。

## 可分享 Preview（不进 Feed）

```bash
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
waku publish                  # 在 pulled 目录里零参运行 = 原地 republish 这个项目
```

要点：
- pulled 目录里有 `.waku/project.json`，`waku publish` 自动识别成 republish（同项目新版、repoint、`published_at` 不动）。
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
