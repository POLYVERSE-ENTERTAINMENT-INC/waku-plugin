# Intake：问用户与 polyverse_request_user_input

## 何时问

开始写 Brief / Spec 或动手 build **之前**，先做 Intake：把用户的模糊创意收敛成确定的内容方向。只在**意图有歧义、且选择会实质影响成品**时问；普通状态 / 进度不要问。信息已经够时，用合理默认往下走、记进 Brief，不要 stall。

（与 SKILL.md「工作流第一步：先问用户」配套——那条是硬规则，这里给「问什么、怎么问」。）

## 用什么工具问：polyverse_request_user_input（AskUserQuestion）

宿主提供的 custom tool。Polyverse app 渲染问题、等用户作答，把答案以 `user.custom_tool_result` 返回。真实 schema：

- `prompt`（必填）：一句话说明这批问题在让用户定什么。
- `questions`（必填）：**1–5 个**问题，每个：
  - `id`：snake_case 答案键
  - `type`：枚举，目前只支持 `single_choice`
  - `title`：问题文本
  - `choices`：**2–6 个**选项，每项 `{ id, label }`

约束：最多 5 题、每题 2–6 选项、单选。把问题集中成一批问完，不要挤牙膏式追问。

## 问什么（只问影响成品的创意 / 内容决策）

- 受众与情绪目标
- 内容类型 / lane（玩法品类）
- 第一个动作（first action）
- 核心循环
- 结果 / 失败条件
- 语气 / 语言
- 内容点名要的平台能力（排行榜、AI、分享…）

模板场景（prompt 带 `template_id`）：问要填的模板槽位决策即可。

## 与 polyverse_present_user_plan 的区别

`polyverse_present_user_plan` 是**二次 edit** 前展示用户可读计划的工具（backend 自动 ack、不等用户输入），由 backend 在 follow-up 时要求调用——**不是**用来问问题的。Intake 问问题只用 `polyverse_request_user_input`。
