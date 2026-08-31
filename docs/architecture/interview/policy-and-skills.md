# 状态机、Policy 与 Skill 契约

[返回 Interview 板块](README.md) · [返回架构 Map](../README.md)

## 当前事实

Anchor Project 已按岗位相关度、能力覆盖、Claim 和技术密度排序；Topic 按预期信息增益选择；Gap 可映射到 Skill ID。固定闭环已运行 Ownership → Evaluation → Failure → Switch Project，并记录 action、targetGap、selectedSkill 与 reason。

`ownership-grill`、`metric-audit`、`failure-forensics` 和 `consistency-check` 均可由 Runtime 加载。Core 已验证多 Project 切换和否认 Claim 后的 `CLARIFY_CONTRADICTION`；Scenario、General Probe、重复惩罚和疲劳控制仍未实现。

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

一个 Session 最多有一个 active Project 和一个 active Topic；`completed` Session 拒绝新 Answer。相同状态必须产生相同 Policy 决策，每个 Question 必须有 DecisionTrace。

## Policy

Policy 只读取 active Project/Topic、open Gaps、Evidence、Competency coverage、矛盾、Turn 数与饱和度。优先顺序为：

1. 澄清影响结论的矛盾；
2. 继续当前高价值 Gap；
3. 切换到当前 Project 的高信息 Topic；
4. 切换到剩余高价值 Project；
5. 用 Scenario 补核心 Competency；
6. 没有高价值 Gap 或达到硬上限时结束。

当前硬上限是整个 Session 15 个 Turn、单 Topic 6 个 Turn；Topic saturation 达到 `0.85` 后不再继续。

Anchor Project 的当前价值函数为：

```text
40% role relevance
30% competency coverage
20% claim density
10% technology density
```

跨 Topic 的目标效用由 competency importance、gap importance、project relevance、expected information gain、conversation continuity、repetition penalty 和 fatigue penalty 组成。模型不能改写这些权重或停止条件。

## Skill

```text
Policy: what to investigate
Skill: how to investigate
Agent: how to ask
```

Skill 只定义适用 Gap、目标 Evidence、可用 Probe、停止条件和禁止行为。它不保存 Session、不评分、不修改状态，也不直接生成多个问题。

| Gap 类型 | Skill | 验证目标 |
| --- | --- | --- |
| `ownership` | `ownership-grill` | 区分个人贡献与团队成果 |
| `metric` | `metric-audit` | 核对指标、基线、数据集和归因 |
| `failure` | `failure-forensics` | 重建故障、诊断、根因和预防 |
| `contradiction` | `consistency-check` | 澄清影响结论的不一致 |
| 其他 | `boundary-push` | 获取边界条件与具体例子 |

## 验收

- [x] `ownership-grill`、`metric-audit`、`failure-forensics` 可由 Runtime 加载；
- 每个核心 Skill 覆盖明确、模糊、否认和矛盾回答；
- Policy 覆盖继续 Topic、切 Topic、切 Project、矛盾、Scenario 和 Finish；
- [x] 确定性 6–10 轮中没有重复主问题；
- 每次切换都能由 Trace 解释；
- Gap 解决后不继续追问同一证据。
