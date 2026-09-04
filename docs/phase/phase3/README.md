# Phase 3：能力深度探测、报告叙述与面试官拟人化

[返回 Phase 索引](../README.md)

**状态：Planned。前置条件：Phase 2 `v0.1.0` 本地 Demo Go。**

## 业务目标

Phase 2 证明了“输入 → 面试 → 可追溯报告”闭环可信。Phase 3 解决闭环里“看得见的智能”不足的问题：追问要能说明候选人能力停在哪一层，报告要能被招聘方直接阅读，面试过程要像一位专业面试官而不是一个表单采集器。

Phase 3 不改变三条硬边界：`InterviewState` 是唯一权威状态；每条 Evidence 的 `sourceQuote` 逐字来自候选人回答；`finish_interview` 必须通过确定性完成校验。所有新增的模型输出都在这些护栏之上叠加，并各自带确定性校验器。

## 当前缺口

以下事实来自 Phase 2 代码与 Pilot 记录，是 Phase 3 的直接动因：

- 每个项目固定四个调查字段，Agent 的目标是“填满字段”，而不是“探测该能力的边界在哪一层”；报告只能说 supported / weak，说不出“能讲做法、说不出取舍”。
- Interview Agent 每轮只读最近四轮对话和字段索引；未跟进的线索没有落点。P01-A Session 出现命名机制未被追问且无法追溯原因的情况。
- `ReportField.summary` 被最新一条 Evidence 覆盖，字段结论只反映最后一次回答；`CompetencyState` 的分数与置信度已计算但报告不使用。
- 报告的综合判断、依据和建议全部是计数模板句；报告只能下载，页面内不渲染，路演时评委看不到成品。
- Interview Agent prompt 没有人设、开场、过渡和收尾规范；结束语是“本轮证据采集完成。”；Pilot 中出现“暂按不确定记录”这类内部记录口吻进入候选人可见文本。
- `skills/` 下四个追问策略目录为空。

## Tasks

| Task | 状态 | 依赖 | 交付结果 |
| --- | --- | --- | --- |
| [3.1 深度梯与线索记忆](task-3.1-depth-and-leads.md) | Planned | Phase 2 | Evidence 深度层级、未跟进线索表、四类追问策略库、能力边界结论 |
| [3.2 报告叙述 Agent](task-3.2-report-narrative.md) | Planned | 3.1 | 引用受控的叙述层、字段结论聚合、页面内实时报告、招聘方与候选人双版建议 |
| [3.3 面试官人设与交互](task-3.3-interviewer-persona.md) | Planned | 无 | 人设与语气规范、开场收尾、过渡语、候选人反问处理、流式问题输出、内部口吻过滤 |
| [3.4 路演就绪](task-3.4-demo-readiness.md) | Planned | 3.1–3.3 | 三个预置演示档案、技术面板、演示脚本、路演回归 Gate |

执行顺序：

```text
3.3 面试官人设与交互      低风险，不触碰状态模型，可先行
3.1 深度梯与线索记忆      扩展 Evidence 与 Agent 视图，是 3.2 的数据来源
3.2 报告叙述 Agent        依赖深度层级和线索表产出可读结论
3.4 路演就绪              收口，冻结演示档案与脚本
```

## 关键边界

- 深度层级、线索、叙述文本都属于 `InterviewState` 或由它派生，不引入第二份模型记忆；
- 叙述层每句结论必须引用已存在的 Evidence ID，校验器拒绝引用不存在或引入回答中未出现的事实；
- 人设与语气只影响候选人可见文本，不影响 Evidence 提取、完成校验和问题约束；
- 演示档案是固定输入与固定回答脚本，不是修改过的 State，路演展示的每一步都由真实链路产生；
- Phase 3 不引入向量检索、外部知识库或候选人级跨 Session 记忆，这些属于 [Phase 4](../phase4/README.md)。

## Phase 退出标准

- strong、weak、contradictory 三类固定 Profile 与 Phase 2 三个发布场景在真实模型下重新通过 Critical/Major Gate；
- 每个非 missing 字段能给出深度层级，报告能对至少一个字段写出“边界停在第 N 层”的结论并引用 Evidence；
- 报告叙述层在全部发布场景下通过引用校验，页面内实时报告与下载报告来自同一 State；
- 人工 Rubric 对问题质量、追问相关性、语气职业感三项不低于 Phase 2 人工评审基线；
- 三个演示档案在真实模型下连续 3/3 完成，路演脚本每一步都有对应的界面状态；
- `npm test`、typecheck、build 通过。
