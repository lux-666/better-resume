# Task 1.5-B：Evaluation

[返回 Phase 1.5](README.md)

## 目标

评估 Agent 输出质量，而不是只检查请求成功、Schema 合法或 Session 最终 completed。所有评分必须能关联到 1.5-A 的 `traceId/spanId`。

**v0.1 实现状态：自动 Scorecard 与人工 Rubric 数据结构已实现；三次真实全量基线和人工打分尚未执行。**

## 两层评测

### 第一层：确定性指标

使用固定 Profile、权威 State、Tool output 和预期 Evidence 自动计算，不调用另一个模型自我评分。

### 第二层：人工质量 Rubric

对真实 Session 抽样评分问题是否自然、具体、有信息价值。v0.1 不直接上线 LLM-as-judge；只有人工样本证明 rubric 稳定后，才考虑用 Judge 扩大覆盖。

## Question Quality

| 指标 | 判断 |
|---|---|
| `singleFocus` | 是否只有一个最终问题 |
| `neutrality` | 是否避免评价性夸奖、诱导和内部评分术语 |
| `answerGrounding` | 问题是否基于最新回答或当前 Report gap |
| `specificity` | 是否指向具体机制、决策、失败、测量或个人边界 |
| `informationValue` | 回答后是否可能改变 Report field、Claim 或 contradiction 状态 |

前三项尽量确定性判断；`specificity` 和 `informationValue` 使用 1–5 人工 Rubric，并保存简短理由。

## Follow-up Relevance

- 目标 Field 在提问时是否为 missing、weak、contradicted 或有效纵向深挖对象；
- 最新回答出现具体命名机制或选择后，下一问是否命中该线索；
- irrelevant 回答后是否恢复到当前调查目标；
- 是否重复已问问题；
- 是否继续追逐 saturated field；
- 是否在有开放 contradiction 时无故切走。

输出至少包括：

```text
gapHitRate
namedClueFollowUpRate
irrelevantRecoveryRate
duplicateQuestionRate
saturatedFieldViolationRate
```

## Evidence Extraction Accuracy

固定 Profile 的 `expected evidence` 作为 gold，不把 Report Agent 自己的输出当答案。逐 Turn 比较：

- answer disposition accuracy；
- report field precision/recall；
- claim ID precision/recall；
- polarity accuracy；
- sourceQuote 是否逐字 grounded；
- multi-field Evidence 是否漏提或错提；
- denial 是否建立正确 contradiction；
- 后续澄清是否正确 resolve contradiction。

同一句回答可能合法支持多个字段，因此只用 exact whole-object match 会误判；评分单位是 Field、Claim、Polarity 和 Quote grounding。

固定回答的 Gold 必须覆盖回答实际提供的全部 Field，不得只复制当前提问目标。系统当前只有一种语义：允许并鼓励有实质依据的 multi-field extraction；不提供“严格只允许当前 Field”的第二模式。

每轮机器结果必须保留：

```text
answer
expectedFieldIds / actualFieldIds
expectedClaimIds / actualClaimIds
```

没有这些明细的聚合 precision/recall 不能作为错误归因证据。

## Interview Completion

- required fields coverage；
- core project coverage；
- open contradiction 数；
- completion allowed 后的多余轮数；
- premature finish rejection 次数；
- hard-limit rate；
- completed turns；
- 每个有效 Evidence 的平均轮数成本。

“结束得早”不是单独的好指标。只有 required coverage、grounding 和 contradiction Gate 同时通过时，较少轮数才代表效率。

## Scorecard

每次评测输出按 Agent 和模型拆分：

```text
model / provider / promptVersion / contextVersion
├── Report Agent quality
├── Interview Agent quality
├── Completion quality
├── Critical / Major failures
├── input / output / cached tokens
└── latency p50 / p95
```

质量与成本必须在同一 Trace 数据集上比较，禁止用不同 Profile 或不同 Prompt 的结果计算“更便宜且更好”。

当前 `evaluation-scorecard.ts` 实际输出：

- Question：single-focus、duplicate rate、target field validity；
- Follow-up：vertical-depth 命名线索追问、saturated field violation、premature finish rejection；
- Evidence：Gold field/claim precision-recall、polarity、answer disposition、grounded quote、contradiction observed/resolved；
- Completion：required field coverage、turns、hard-limit；
- Failure：Critical / Major 数量；
- Telemetry：request 数、累计模型耗时、input/output/reasoning/cache tokens、最大约算 context、错误数；
- Manual Review：五个字段默认 `null`，要求人工填写判断和理由，程序不伪造主观分。

`npm run eval:model -- <profile|all>` 的每个 `profile_result` 同时包含机器可读 `scorecard`、关联 `telemetry` 和人类可读 `scorecardMarkdown`。

## 基线

使用当前 Phase 1 配置运行全部六个 Profile，保持 Prompt、Context、Tool 和 Gate 不变，连续运行三次，形成 routing 前基线：

- strong；
- weak；
- contradictory；
- multi_field；
- vertical_depth；
- evasive。

旧 P01-A/B 可以作为人工 Rubric 示例，但没有 1.5-A Trace 的历史 Session 不作为 token/latency 基线。

## 验收

- 每个固定 Profile 都有明确 gold expectation，不从被评模型输出反推标签；
- Question、Follow-up、Evidence、Completion 四类指标可重复计算；
- 同一评测结果可回到 `traceId/spanId` 和最小 Transcript；
- 当前主模型完成三次全量基线，Critical 为 0，现有行为 Gate 保持 3/3；
- 至少完成一次真实 Session 人工 Rubric，记录评分理由和自动指标无法覆盖的观察；
- 产出机器可读 JSON 和人类可读 Markdown Scorecard；
- 不因追求综合分数降低 grounding、Claim、Field、Competency 或 Completion Validator。

## 当前边界

- 自动指标只能证明结构、Gold 对齐和已编码行为；“问题自然不自然、是否真正有信息价值”仍必须人工判断；
- v0.1 不计算一个掩盖细节的总分，也不以模型自报 confidence 代替正确率；
- `extraTurnsAfterRequiredCoverage` 暂为 `null`，因为当前最终 State 没保存“首次达到完整覆盖”的历史快照；若后续需要该指标，应从逐 Turn evaluation snapshot 计算，不能用最终轮数猜；
- 三次全量真实基线属于验证活动，不应在没有真实 Provider 运行结果时写成“已通过”。
