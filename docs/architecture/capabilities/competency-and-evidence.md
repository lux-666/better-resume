# 胜任力与证据

[返回能力建设 Map](README.md) · [领域模型](../domain/model.md)

## 目标

把“候选人看起来不错”拆成可追踪判断：岗位需要哪些能力、每项能力需要什么行为证据、当前证据支持什么结论、结论有多确定。

## 当前事实

- `llm_application_engineer` Role Pack 定义 8 个 Competency、权重和 `core` 标记；
- Domain 已有 Claim、Evidence、EvidenceGap 和 CompetencyState；
- Evidence 保存 polarity、strength、specificity、evaluatorConfidence 和 sourceQuote；
- score 与 confidence 分开计算，并保存 Evidence ID；
- 固定闭环只实际更新 `software_engineering` 与 `evaluation`；
- Role Pack 权重尚未进入 Core 的评分、Policy 或停止条件；
- Competency 尚无行为锚点、反向指标、必要证据类型和覆盖阈值；
- 当前 scorer 是演示算法，尚未版本化或校准。

## Role Pack 设计

```text
Role
└── Competency[]
    ├── id / name
    ├── weight / core
    ├── behavioralAnchors
    ├── positiveIndicators
    ├── negativeIndicators
    ├── requiredEvidenceTypes
    └── coverageThreshold
```

Behavioral Anchor 描述可观察行为，不使用“优秀”“深入理解”等无法验证的形容词。每个等级必须能映射到候选人的具体决策、行动、约束或结果。

## Evidence 更新

```text
Raw Answer
  → Evidence proposal
  → quote and context validation
  → accepted Evidence
  → Claim linkage
  → Competency score
  → confidence / coverage / contradiction
```

`score` 表示能力估计，`confidence` 表示证据是否充分和一致，`coverage` 表示 Role 要求的证据类型覆盖程度。三者不能合并成一个数字。

总体结论必须满足：核心 Competency 达到覆盖阈值、重要矛盾已处理、每个等级都有 Evidence ID。权重只能聚合已有判断，不能补偿核心能力完全无证据。

## 下一验收点

完成一个可执行的 LLM Application Engineer Role Pack，并用强、弱、矛盾三个固定 Profile 验证：

- 每个核心 Competency 至少有一个行为锚点和必要证据类型；
- 相同 Evidence 集和 scorer 版本产生相同结果；
- 未验证 Resume Claim 不改变 score；
- score 高但 coverage 低时不能产生高置信结论；
- contradicting Evidence 在结果和 UI 中可见；
- Policy 能根据缺失的必要证据选择下一 Gap。
