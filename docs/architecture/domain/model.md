# 领域模型

[返回 Domain](README.md) · [返回架构 Map](../README.md)

## 聚合根

`InterviewState` 是一次面试的聚合根，也是持久化和恢复的最小完整单位：

```text
sessionId
roleId
status: draft | active | completed
currentQuestion?
candidate
turns[]
evidence[]
competencies[]
traces[]
```

Project 只存在于 `candidate.projects`；其他对象通过 ID 引用它，不能复制第二份 Project 状态。

## CandidateProfile 与 Project

`CandidateProfile` 保存简历事实、经历、技能和项目。`Project` 是主要面试上下文，包含候选人角色、技术、结果、Claims、能力映射、Topics、状态和岗位相关度。

Anchor Project 根据下列确定性信号排序：

```text
40% role relevance
30% competency coverage
20% claim density
10% technology density
```

## Claim

Claim 是来自简历或回答、可以被证伪的陈述：

```text
id
source: resume | candidate_answer
text
projectId?
status: unverified | supported | weakened | contradicted
relatedCompetencies[]
supportingEvidenceIds[]
weakEvidenceIds[]
contradictingEvidenceIds[]
```

简历只创建 `unverified` Claim。Claim 的状态只能由关联 Evidence 改变。

## TopicThread 与 EvidenceGap

TopicThread 是一个 Project 内有边界的调查线索，记录：

- 当前状态和摘要；
- Evidence 与 Turn 引用；
- 未解决的 EvidenceGap；
- 待追踪线索和相关能力；
- 饱和度与预期信息增益。

EvidenceGap 描述一个能力判断还缺什么证据。它具有重要度和 `open | resolved | low_value` 状态，是 Policy 选择下一次调查目标的直接输入。

## InterviewTurn

InterviewTurn 保存不可变的问答原文：

```text
id
index
projectId?
topicId?
question
answer
timestamp
```

摘要和模型上下文可以由 Turn 派生，但不能替代原始文本。

## Evidence

Evidence 是对某段 Answer 原文的结构化解释：

```text
id
turnId
projectId?
topicId?
claimIds[]
competencyId
statement
polarity: support | weakness | invalidate
strength: 0..1
specificity: 0..1
evaluatorConfidence: 0..1
sourceQuote
```

`sourceQuote` 必须逐字存在于 `turnId` 对应的 Answer 中。`statement` 是解释，`sourceQuote` 才是可审计来源。

## CompetencyState

CompetencyState 分离能力估计与证据充分度：

- `score`：证据加权后的能力估计；
- `confidence`：证据是否足够具体且一致；
- `evidenceIds`：计算依据；
- `missingEvidence`：尚未关闭的 Gap；
- `contradictoryEvidence`：未解决的反向证据。

分数高但置信度低必须保留这种不确定性，不能折叠成单一等级。

## DecisionTrace

每个问题都通过 DecisionTrace 回答“为什么要问”：

```text
turnId?
action
projectId?
topicId?
selectedSkill?
selectedProbe?
targetGap?
reason
generatedQuestion?
```

模型版本、Prompt 版本和 Schema 版本由模型接入层补充到可观测记录，而不是改变领域判断。
