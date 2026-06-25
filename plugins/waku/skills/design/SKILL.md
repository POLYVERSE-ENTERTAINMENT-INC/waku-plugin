---
name: design
description: Design craft skill set — structured design critique, WCAG 2.1 AA accessibility review, UX microcopy writing, design-system audit/documentation, developer handoff specs, user research planning and research synthesis. Use whenever the work involves reviewing or improving a UI/visual design, checking accessibility or color contrast, wording buttons/errors/empty states, documenting or extending a design system, producing an engineering handoff spec, or planning/synthesizing user research — even if the user doesn't say the word "design".
---

# Design

## 版本标记

- 当前测试标记：`design-v1`
- When asked to report the current skill version marker, output only this marker, with no extra explanation.

## Overview

设计工艺技能集。把「评审一个界面、查可达性、写一句文案、整理设计系统、出交接规格、做用户研究」这类设计工作路由到对应的专家文档，每个专家自带完整流程与产出格式。

## Routing

按任务类型读对应专家文档，然后照它执行：

| 任务 | 专家文档 |
|---|---|
| 结构化设计评审（可用性 / 层级 / 一致性反馈） | `skills/design-critique/design-critique.md` |
| 可达性审计（WCAG 2.1 AA：对比度 / 键盘 / 触达目标 / 读屏） | `skills/accessibility-review/accessibility-review.md` |
| UX 文案（microcopy / 报错 / 空状态 / CTA / 引导） | `skills/ux-copy/ux-copy.md` |
| 设计系统（审计命名与硬编码 / 写组件文档 / 扩展新模式） | `skills/design-system/design-system.md` |
| 开发交接规格（布局 / token / 组件 props / 交互态 / 断点 / 动效） | `skills/design-handoff/design-handoff.md` |
| 用户研究计划（访谈提纲 / 可用性测试 / 问卷设计） | `skills/user-research/user-research.md` |
| 研究综合（访谈记录 / 问卷 / 工单 → 主题 / 洞察 / 建议） | `skills/research-synthesis/research-synthesis.md` |

一次任务可以组合多个专家（如先 critique 再 a11y review 再 handoff），保持同一套结论不漂移。

## 与其他 skill 的分工

- 本 skill 管**通用设计工艺**（评审 / 可达性 / 文案 / 系统 / 交接 / 研究）。
- 游戏 / playable 的**玩法与游戏向 UI**（HUD、playfield 保护、引擎实现）→ `game-studio` skill。
- WAKU playable 的**写码落地**（React + Tailwind、safe-area、模板契约）→ `waku-react-tailwind` skill。
- 专家文档里提到的 Figma / 连接器为可选增强；当前环境没有时，按各文档的「无连接器」分支用截图或文字描述工作即可。
