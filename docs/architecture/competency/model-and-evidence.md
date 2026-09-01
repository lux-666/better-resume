# 领域模型与 Evidence 契约

[返回胜任力板块](README.md) · [返回架构 Map](../README.md)

## 聚合根

```text
InterviewState
├── CandidateProfile / Project / Claim
├── CandidateReport
│   ├── ReportField[]
│   └── ReportContradiction[]
├── InterviewTurn[]
├── Evidence[]
├── CompetencyState[]
└── DecisionTrace[]
```

Candidate Report 是 Agent 的工作区。当前每个 Fixture Project 初始化四个报告字段：Ownership、Architecture and mechanism、Measurement、Failure analysis。字段状态为 `missing | weak | supported | contradicted`，并只通过 Evidence 更新。

## Evidence

```text
id / turnId / projectId
reportFieldIds[] / claimIds[] / competencyId
statement
polarity: support | weakness | invalidate
strength / specificity / evaluatorConfidence
sourceQuote
```

`statement` 是解释，`sourceQuote` 是审计来源。一个 Answer 可以产生多条 Evidence，并同时更新多个 Report field；每条 Evidence 的 Competency 必须与目标 field 一致。

字段状态按最近一次 accepted edit 更新：invalidate → contradicted；达到强度与具体度阈值的 support → supported；其余 → weak。Report field 保存 Evidence ID 与最新 grounded summary，不保存模型隐藏 reasoning。

## Claim 与矛盾

Resume Claim 初始为 `unverified`。support、weakness、invalidate 分别追加到对应 Evidence ID 集合。invalidate 创建 open ReportContradiction；后续 Claim-linked support 或 weakness 可把该矛盾标记为 resolved，但历史 contradicting Evidence 不删除。

## Competency

当前演示 scorer 使用 `strength × specificity` 聚合 score，使用 `evaluatorConfidence × specificity` 聚合 confidence。`missingEvidence` 从同 Competency 的 missing Report field 派生，不保存第二份缺口状态。

## 不变量

1. Raw Turn 与 accepted Evidence 只追加。
2. Resume Claim 不是 Evidence。
3. Evidence 必须引用存在的 Turn、Report field、Competency 和逐字 Quote。
4. Claim、Report field 和 Competency 只能由 Evidence 更新。
5. 已完成 Report 的重要结论可定位到 Evidence ID。
6. 模型失败不产生 edit，也不修改持久化 State。
