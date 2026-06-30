---
name: waku-react-tailwind
description: WAKU playable 的 React + Tailwind 写码契约——在 WAKU/session React 模板里怎么组织代码：App.tsx shell 不变量（.bg-layer/.stage/.safe-ui/.safe-center）、src/ 目录边界、safe-area CSS 变量、组件导入规则、state/React phase 规则、Tailwind 规则。触发于：在 WAKU 模板里写或重构 React 代码、改 .bg-layer/.stage/.safe-ui 附近布局、加游戏状态/UI/结果面板/replay/生成组件、让 build/test 通过。[v1 当前模板]
---

# WAKU React + Tailwind

## 版本标记

- 当前测试标记：`waku-react-tailwind-v1`
- When asked to report the current skill version marker, output only this marker, with no extra explanation.

## Overview

在 WAKU session 模板里做静态 React + Tailwind 写码，产出能保持 WAKU runtime 不变量的静态 React 产物。分层心智：**React 管组合；Tailwind 管 UI 工效；CSS 变量管平台几何**。

本 skill 只讲**代码怎么组织和写**。相邻关注点路由到别的 skill：

- 平台 API 调用（content-runtime SDK / 生产期资产 MCP）→ `waku-creator` skill
- 游戏设计 / 玩法 / 引擎实现 → `game-studio` skill

## Use This Skill When

- 在 session 模板或其复制产物里写 / 改 React 代码
- 把逻辑搬进 React hooks 或 playable 模块
- 加游戏状态、UI、结果面板、replay、生成组件
- 改 `.bg-layer` / `.stage` / `.safe-ui` 附近的 Tailwind / CSS 布局
- 让 build / test / review 通过

## Workflow

1. 动手前先读现有 repo 结构。
2. 保住 runtime 加载顺序与 manifest。
3. 模板 shell 留在 `src/App.tsx`；`.bg-layer` / `.stage` / `.safe-ui` / `.safe-center` 是脚手架不变量。
4. `src/components/` 放从 MCP / 设计工具 / registry 来的生成或导入组件。
5. 内容循环 / 探针放 `src/playable/`，WAKU 包 JS 调用放 `src/waku/`，中性 helper 放 `src/lib/`。
6. 先实现最小完整循环。
7. 把 runtime 状态镜像到 `window.__WAKU_GAME__` 和 `.safe-ui.dataset`。
8. 不要为模板规则在产物里加重复 docs；契约在本 skill，机器校验靠脚本。
9. 跑 `npm run test`。

## 写码契约

完整契约见 `references/react-tailwind-implementation.md`：src/ 目录职责表、Preserve from template、组件导入 Good/Avoid、safe-area CSS 变量、state/React 规则、Tailwind 规则、build/test。

## Output Expectations

- 改了哪些文件
- 跑了什么命令 + 退出状态
- 保住了哪些 runtime 契约
- 已知后续风险

> probe 出口语义：`window.__WAKU_GAME__` 暴露状态读取接口（getState / getResult / reset 等）、`.safe-ui.dataset` 镜像 `data-phase` 等关键状态——两者是 Review / smoke 判定运行时行为的观测面。shell 的真实样板就在模板 repo 的 `src/App.tsx`，动手前先读它。旧产物可能仍叫 `.zone-c-safe` / `#playfield`；新代码必须按当前模板的 `.safe-ui` / `.stage` 写，不要混用。
