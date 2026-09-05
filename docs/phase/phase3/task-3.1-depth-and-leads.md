# Task 3.1：深度梯与线索记忆

[返回 Phase 3](README.md)

## 目标

让 Interview Agent 的调查目标从“把字段从 missing 变成非 missing”变成“沿一条固定的深度梯向上探测，直到候选人给不出更深一层的可验证内容”。报告据此写出能力边界，而不是只写有无证据。

## 深度梯

每个 Report field 共用一条五层深度梯。层级只描述回答展示了什么，不描述回答好坏。

| 层级 | 名称 | 判定标准 | 示例问题方向 |
| ---: | --- | --- | --- |
| 1 | 陈述 | 说出做了什么、用了什么 | 你负责的部分是什么 |
| 2 | 细节 | 给出具体参数、步骤、数字或人名边界 | 召回多少条、切分粒度是多少 |
| 3 | 依据 | 说明为什么这样做、基于什么观察或数据 | 为什么选 RRF 而不是加权融合 |
| 4 | 取舍 | 说明放弃了什么替代方案、承担了什么代价 | 引入 reranker 后延迟增加多少、怎么权衡 |
| 5 | 迁移 | 能把经验推到失败案例、新约束或不同场景 | 如果文档量扩大十倍，这套方案哪里先出问题 |

Evidence 增加 `depthLevel: 1 | 2 | 3 | 4 | 5`，由 Report Agent 在 `edit_report` 时标注。Report field 增加派生字段 `reachedDepth`，取该字段所有 support Evidence 的最大层级；`boundaryReason` 记录第一次出现 weakness 或 vague 的层级与原话。

字段结论口径：

```text
reachedDepth = 2, boundaryReason 在第 3 层
→ 能说明做法与参数，未能说明选择依据
```

## 线索表

线索是有原话来源的事实记录；跟进状态由已接受 Decision 的引用与 Session 完成态派生，不保存另一套调查路由状态。Core 只验证来源、项目归属与重复引用，调查方向仍由 Agent 决定。

`InterviewState` 增加 `leads: Lead[]`：

```ts
interface Lead {
  id: string;
  turnId: string;
  projectId: string;
  kind: "mechanism" | "metric" | "decision" | "constraint" | "failure" | "person_boundary";
  text: string;            // 候选人原话中的短语，必须是 answer 子串
  suggestedFieldId?: string;
  status: "open" | "followed" | "dropped";
  followedByTurnId?: string;
  dropReason?: string;
}
```

Report Agent 在 `edit_report` 中同时提交 `leads`，`text` 受与 `sourceQuote` 相同的逐字校验。Interview Agent 的 `read_report` 视图新增 `openLeads`；`ask_candidate` 增加可选 `followsLeadId`，被已接受 Decision 引用的 Lead 派生为 followed。Agent 选择不跟进某个 Lead 时不需要解释；完成时未引用的 Lead 派生为 dropped 并写入报告“未展开线索”。

这解决 P01-A 的漏追问题：漏追不再是无法追溯的行为，而是报告里一条可见记录。

## 追问策略库

`skills/` 下四个空目录填充为 Markdown playbook，每个文件包含：适用字段类型、目标层级、常见回避模式、对应追问方向、禁止的引导性措辞。

| 目录 | 适用字段 | 核心 |
| --- | --- | --- |
| `ownership-grill` | ownership | 区分“我们”与“我”，定位个人决策点，确认交付物边界 |
| `metric-audit` | measurement | 口径、基线、样本量、统计周期、对照条件、谁测的 |
| `failure-forensics` | failure | 现象 → 定位手段 → 根因 → 修复 → 验证 → 防复发 |
| `consistency-check` | 跨项目与 Claim | 同一技能在不同项目的说法、时间线、角色是否一致 |

Interview Agent 每轮只注入与 `focusedFieldId` 匹配的一份 playbook，控制上下文体积。Phase 4 的 [4.1](../phase4/task-4.1-interviewer-knowledge-rag.md) 会把注入方式改为检索。

## 跨项目一致性

当前矛盾检测只覆盖 Claim 与同项目回答。3.1 增加一类 `cross_project` contradiction：Report Agent 视图新增 `candidateSkillStatements`，列出候选人在其他项目已被接受的、涉及同一技能或角色的 Evidence statement；Agent 判定当前回答与其冲突时，提交 `polarity: "invalidate"` 且 `claimIds` 指向由系统为该技能生成的合成 Claim。合成 Claim 的 `source` 为 `candidate_answer`，`sourceQuote` 是原 Evidence 的原话。

## Agent 契约变更

- `ReportEditSchema` 增加 `depthLevel` 与 `leads`；
- `AskCandidateSchema` 增加可选 `followsLeadId` 与 `targetDepth`；
- Interview Agent prompt 目标改写为：优先沿当前字段向上一层探测；当前层级出现 vague 或到达第 5 层时切换；open Lead 优先于 missing 字段；
- `validateCompletion` 新增软条件：每个项目至少一个字段 `reachedDepth >= 3` 或存在 `boundaryReason`，否则作为 blocker；硬上限 15 轮不变。

## 评测

- 固定 Profile 增加 `boundary` 档：候选人在第 2 层稳定回答、第 3 层一律回避。期望 Agent 在两次 vague 后切换，报告写出边界在第 3 层；
- Gold 增加 `expectedDepthLevel`，Scorecard 增加深度标注准确率；
- 人工 Rubric 增加“边界结论是否与对话一致”一项。

## 验收

- Evidence 深度标注在 frozen Report replay 上与 Gold 一致率 ≥ 80%；
- `boundary` Profile 与现有六个 Profile 全部通过 Critical/Major Gate；
- 至少一个发布场景的报告出现 open Lead 被跟进与被 dropped 的两种记录；
- 一个真实模型 Session 内不出现同一 Lead 被重复跟进。
