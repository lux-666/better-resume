# Task 3.3：面试官人设与交互

[返回 Phase 3](README.md)

**实现状态：Implemented。澄清、跳过、收尾、内部口吻过滤和候选人可见进度已接入。**

## 目标

让候选人可见的每一句话都像一位专业、克制、有礼貌的面试官说出来的，同时不让人设影响 Evidence 提取、问题约束和完成校验。

## 范围

分两部分交付：人设、过渡与 3.0 的真实等待反馈先行；反问、跳过和结束后补充涉及状态与轮次语义，独立验证。问题、Evidence 和完成护栏继续适用。

## 人设规范

写入 Interview Agent prompt 的固定段落，内容要点：

- 身份：目标岗位的资深同行面试官，对候选人的项目有真实好奇，目标是理解而不是考倒；
- 语气：平实、具体、不套话，不使用“非常棒”“很好”类评价，也不使用“记录为”“按不确定处理”类内部口吻；
- 节奏：每轮一个问题；候选人回答具体时直接向下一层追问，回答含糊时给一次换角度的机会，再次含糊就自然过渡到下一话题；
- 边界：不猜测候选人没说的内容，不替候选人补全答案，不对候选人做人身评价。

## 会话阶段

`InterviewState` 新增 `conversation` 派生字段，Core 不持久化模型记忆，只记录阶段标记：

```text
opening   → 第一问之前：自我介绍、说明流程与时长、说明可以说“不清楚”
probing   → 正常提问
transition → 切换项目或字段时，一句承接上一话题的过渡
closing   → finish 被接受后：感谢、说明后续、询问候选人是否有补充
```

`ask_candidate` 新增可选 `transition: string`，与 `acknowledgement` 一样受无问号、无评价、无内部术语校验；页面按 acknowledgement → transition → question 顺序显示。

closing 由确定性模板加候选人姓名生成，不调用模型；候选人补充内容进入一条特殊 turn，`reportFieldId` 为空，Report Agent 仍可从中提取 Evidence。

## 候选人反问与跳过

当前回答只能被当作对问题的答复。3.3 增加 `answerDisposition: "question_back" | "skip_request"`：

- `question_back`：候选人反问问题含义或范围。Interview Agent 下一步允许输出 `clarification` 而不是新问题，clarification 不计入轮次，同一问题最多澄清一次；
- `skip_request`：候选人明确要求跳过。该字段记为 weakness Evidence，`boundaryReason` 写“候选人选择不展开”，Agent 不得再次追问同一字段。

## 文本过滤扩展

`validateCandidateQuestion` 与 acknowledgement / transition 共用的过滤词表扩展：

```text
内部口吻：记录为、按…处理、暂按、标记、归档、证据、字段、维度、Report、Evidence
评价性：非常棒、很棒、很好、优秀、厉害、显然、这证明、由此可见、你确实、不错、可以看出
```

“证据”“维度”在候选人可见文本中禁止，在报告中允许。

## 页面文案

| 位置 | 现文案 | 目标 |
| --- | --- | --- |
| 完成态 | 本轮证据采集完成。 | closing 模板：感谢 + 后续说明 |
| 右栏标题 | 02 / 证据覆盖进度 | 候选人视角：面试进度 |
| 进度网格 | Project / Report / 核心能力 | 已聊到的项目 / 已聊到的话题 |
| 提交等待 | 提交中… | 正在提交 → 已接收 → 整理回答 → 准备下一问 → 保存结果，显示本轮已用时间及重试 |

审核模式下保留原技术标签。

## 流式输出

等待期间由 3.0 的独立进度流反馈真实阶段。`ask_candidate` 的 question 仍完整校验后展示；逐字动画仅为可选展示效果，不能作为改善等待的交付。

## 评测

- 人工 Rubric 增加“语气职业感”“情商”两项，每项 1–5 分，由至少两名评审对三个发布场景独立打分；
- 自动 Gate 增加：候选人可见文本零内部术语、零评价词、opening 与 closing 必现；
- `question_back` 与 `skip_request` 各增加一个固定 Profile。

## 验收

- 两个新 Profile 与已有 Profile 全部通过 Gate；
- 语气职业感与情商两项人工均分不低于 4；
- 任一 Session 的 clarification 不超过一次每问题，不计入 15 轮上限；
- Evidence 提取结果在人设变更前后对相同 frozen 输入保持一致。
