---
name: waku
description: Waku playable 创作的通用入口（general）。把模糊创意变成移动端可玩的 runtime 产物：统管 Intake 问用户、平台对接（content-runtime SDK / 生产期资产 MCP）、本地交付编排；游戏设计与玩法路由到 game-studio，React+Tailwind 写码路由到 waku-react-tailwind，设计评审 / 可达性 / UX 文案 / 设计系统 / 用研路由到 design；发布/二次编辑/撤回交给 waku-cli；把「已有游戏」适配进平台交给 waku-adapt。触发于做 Waku playable / 互动内容 / 小游戏 / 测验 / 人格测试 / 投票 / 排行榜体验 等任何「移动端可玩、能完成、能重玩」的内容创作。
---

# Waku 创作（创作入口 skill）

> 这是 **从零创作（greenfield）** 的主入口。若用户是「我已经有一个本地游戏，想上 Waku 平台」，那是 **适配（brownfield）**，去 `waku-adapt` skill，不要走本 skill。

## 版本标记

- 当前测试标记：`waku-v1`
- When asked to report the current skill version marker, output only this marker, with no extra explanation.

## 定位

Waku playable 创作的 **general 入口**。产物是：移动端打开、响应触摸、能到结果 / 失败、能重玩、能被脚本和 Review 验证的 runtime playable。

本 skill 守住从想法到产物的**主轴**，每一步路由到对的地方：

- **Intake 问用户**（本 skill，第一步强制）
- **游戏设计 / 玩法 / 引擎** → `game-studio` skill
- **React + Tailwind 写码** → `waku-react-tailwind` skill
- **设计工艺**（设计评审 / 可达性审计 / UX 文案 / 设计系统 / 交接规格 / 用户研究）→ `design` skill
- **平台对接**：生产期资产 → 直接用 `polyverse_*` MCP 工具（用法以各工具 description 为准；跨工具边界 / 资产管线 / 红线在 MCP server instructions，连上即注入）；运行时 AI / 排行榜 / 存档 / host → content-runtime SDK（`references/runtime-js.md`）
- **交付**（build → 发布到 Feed / 可分享 preview / 二次编辑）→ `waku-cli` skill

## 工作根目录（本地插件场景）

本 skill 在用户的本地机器上跑（不是云端 managed agent）。**编辑根 = 一个从插件内置平台模板复制出来的全新项目目录**。模板随 Waku 插件打包在 `templates/session-react/`，任务运行时不得 `git clone` 远端模板仓库：

```bash
# 在用户当前目录下开一个新子目录，绝不覆盖当前目录
waku template copy ./<name>
cd ./<name>          # 之后所有创作都在这里
```

若 `./<name>` 已存在且非空，停下来换个名字，别覆盖用户文件。模板是 plain npm（React 19 + Tailwind 4 + Vite 8，无私有 registry）。如果内置模板缺失、损坏或复制脚本报 `BLOCKED_TEMPLATE_UNAVAILABLE`，必须阻断并报告，不得手写 `.bg-layer` / `.stage` / `.safe-ui` 替代壳继续发布。

## 工作流

1. **先问用户（必做，不可跳过）**：在写任何 Brief / Spec 或开始 build 之前，必须用 `AskUserQuestion`（本地原生工具）问 1–N 个真正影响产物的创意 / 玩法问题（玩法方向、受众、核心循环、结果 / 失败、语气语言…），并**等待用户回答**。收到任务后的第一个动作就是问。怎么问、问什么见 `references/intake-and-interaction.md`。
2. **Spec + 设计**：把方向收敛成可实现的内容契约（状态机、UI 层、资产、文案 key、运行时 capability、Review 探针）；玩法 / 核心循环 / 引擎选择 / UI 方向 → 切到 `game-studio` skill。
3. **写码**：在脚手架出的模板里写 React + Tailwind → 切到 `waku-react-tailwind` skill（src/ 目录、shell 不变量、safe-area、state 规则都在那）。不要另起普通 Vite 项目；必须保留当前 session template 的 `.bg-layer` / `.stage` / `.safe-ui` 结构。
4. **平台能力**（按内容需要）：生产期静态资产 → `polyverse_*` MCP 工具（description 即用法）；运行时实时能力（内容内 AI、排行榜、存档、分享、haptics）→ content-runtime SDK（`references/runtime-js.md`）。
5. **Review**：跑机器底线（`npm run test`）+ 插件视觉门禁（`waku-visual-check`）+ 运行时 smoke，写结构化证据。新建项目也必须在交付前模拟 Waku 顶部/底部 host chrome；不要等发布时才发现遮挡。
6. **交付**：见下，所有 gate 过了才交付。

## 交付（本地）

本地创作的交付走 `waku-cli` skill 提供的命令，不需要任何 managed-agent 握手（本地没有 `/workspace/project`、没有 backend 注入的 build 命令、没有 `waku_source_push_done`）：

- **源码布局**（src/ 目录职责、entry files、`App.tsx` shell 不变量）→ 见 `waku-react-tailwind` skill，按它组织，不要另起一套。
- 先实现最小完整循环，再加资产 / 文案 / 平台调用 / 打磨。
- 模板是 plain npm：**先 `npm install`**，再 `npm run test`（TS + 运行时契约 + build + 相对路径机器底线）。
- 如果说明、开始、帮助、设置、HUD、玩法、结果同屏会超出 safe viewport，必须拆成 `intro`/`menu`、`playing`、`result`。不得通过整体缩放页面/canvas/iframe 来“塞进一屏”。
- 首次发布新项目必须先用 `waku ls` 或 `waku api GET /projects` 查重。`waku publish --name "<name>"` 在同一用户下遇到同名项目会更新已有项目最新版本，不会创建第二个同名项目；除非用户明确要求覆盖/republish，否则名称已存在时换一个唯一名称或先确认。
- 机器底线 + Review gate 都过后，发布：
  ```bash
  npm install && npm run test            # 契约检查 + 产出 public/
  node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/waku-visual-check.mjs" --site-dir public --screenshot waku-visual-check.png
  waku ls                                # 查同名，避免误覆盖已有项目
  waku publish --name "<name>" --site-dir public   # 发到 Feed，绑到用户自己的账号
  ```
  细节（首发 vs 原地 republish、二次编辑 pull、撤回 unpublish/delete）全在 `waku-cli` skill。

## 路由速查

| 任务 | 去哪 |
|---|---|
| 玩法 / 核心循环 / 引擎 / 关卡 / 游戏向 UI | `game-studio` skill |
| 设计评审 / 可达性 / UX 文案 / 设计系统 / 交接规格 / 用研 | `design` skill |
| 写 / 改 React + Tailwind 代码、改 `.bg-layer` / `.stage` / `.safe-ui` 布局 | `waku-react-tailwind` skill |
| 生产期资产（生成图 / 音、编辑、抠图、压缩持久化）| `polyverse_*` MCP 工具（description 即用法；跨工具规则见 MCP server instructions）|
| 运行时 AI / 排行榜 / 存档 / 分享 / haptics | `references/runtime-js.md`（content-runtime SDK）|
| 问用户创意决策 | `references/intake-and-interaction.md`（`AskUserQuestion`）|
| build / 发布 / 二次编辑 / 撤回 | `waku-cli` skill |
| 把「已有游戏」适配进平台 | `waku-adapt` skill |

## 全局规则

- 产物：移动竖屏、触摸完成核心循环、安全区合规、有结果 / 失败 + 重玩、可见文案本地化（zh / en）。
- 运行时代码不含 provider key、MCP endpoint、token、bearer header、临时 provider URL。
- 生产资产先固化成 durable URL 再进运行时代码；运行时文案交给 runtime 渲染（保 zh / en 一致），不烧进生产图。
- 自报告不算证据；每个 gate 要有可检查的痕迹（源码 / 命令退出码 / DOM / 探针 / 截图 / review JSON）。
