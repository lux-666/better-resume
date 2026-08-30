# 不变量与状态机

[返回 Domain](README.md) · [返回架构 Map](../README.md)

## 领域不变量

1. Raw Turn 和已接受 Evidence 只追加。
2. 简历 Claim 初始为 `unverified`，不直接影响能力分数。
3. 每条 Evidence 引用一个存在的 Turn 和一个存在的 Competency。
4. `sourceQuote` 必须是对应 Answer 的逐字子串。
5. Claim 状态只能通过关联 Evidence 改变。
6. Competency 的 score 与 confidence 只能由 Evidence 推导。
7. 已解决的 Gap 必须能定位到解决它的 Evidence。
8. 相同状态必须产生相同 Policy 决策。
9. 每个生成的问题必须有 DecisionTrace。
10. 模型失败不产生 Evidence，也不生成推测性事实。
11. 一个 Session 最多有一个 active Project 和一个 active Topic。
12. `completed` Session 拒绝新的 Answer。

## Session 状态机

```text
DRAFT
  └─ start → ACTIVE

ACTIVE
  ├─ answer + CONTINUE_TOPIC → ACTIVE
  ├─ answer + SWITCH_TOPIC   → ACTIVE
  ├─ answer + SWITCH_PROJECT → ACTIVE
  ├─ answer + SCENARIO_PROBE → ACTIVE
  └─ answer + FINISH         → COMPLETED

COMPLETED
  └─ terminal
```

动作词汇为：

```text
CONTINUE_TOPIC
SWITCH_TOPIC
SWITCH_PROJECT
SCENARIO_PROBE
CLARIFY_CONTRADICTION
GENERAL_PROBE
FINISH
```

## Policy 顺序

1. 澄清影响判断的矛盾；
2. 继续当前高价值 Gap；
3. 切换到当前 Project 中信息增益最高的 Topic；
4. 切换到价值最高的剩余 Project；
5. 用 Scenario 覆盖仍无证据的核心能力；
6. 没有高价值 Gap 或达到硬上限时结束。

当前硬上限为整个 Session 15 个 Turn、单个 Topic 6 个 Turn；Topic 饱和度达到 `0.85` 后不再继续该 Topic。

## Gap 到 Skill

| Gap 类型包含 | Skill |
| --- | --- |
| `ownership` | `ownership-grill` |
| `metric` | `metric-audit` |
| `failure` | `failure-forensics` |
| `contradiction` | `consistency-check` |
| 其他 | `boundary-push` |

Policy 决定缺什么证据，Skill 决定如何调查，语言模型只把选定的 Probe 表达为一个问题。

## 分数与置信度

每条 Evidence 的质量以 `strength × specificity` 计算。支持性 Evidence 将能力估计推向 100，弱点或无效 Evidence 将估计推向 0；同一能力的结果取平均并四舍五入。

置信度是 `evaluatorConfidence × specificity` 的平均值，上限为 `0.95`。评分器必须版本化；相同版本和相同 Evidence 集必须得到相同结果。

跨 Topic 的效用排序使用以下输入：

```text
competency importance
× gap importance
× project relevance
× expected information gain
× conversational continuity
− repetition penalty
− fatigue penalty
```

权重属于 Role 与 Policy，模型不能在 Session 中改写它们。
