# Interview Policy 与 Skills

[返回能力建设 Map](README.md) · [状态机](../domain/invariants-and-state-machine.md)

## 目标

Policy 决定下一轮最值得验证什么，Skill 定义如何调查，Agent 只负责把选定 Probe 表达成自然问题。

```text
Policy: what to investigate
Skill: how to investigate
Agent: how to ask
```

## 当前事实

- Anchor Project 根据岗位相关度、能力覆盖、Claim 和技术密度排序；
- Topic 根据预期信息增益选择；
- Gap 可路由到 Ownership、Metric、Failure、Contradiction 等 Skill ID；
- 固定闭环已运行 Ownership → Evaluation → Finish；
- DecisionTrace 已显示 action、targetGap、selectedSkill 和 reason；
- 仓库只有 `ownership-grill` Skill 指令；
- `metric-audit` 与 `failure-forensics` 尚未形成可加载 Skill；
- 矛盾澄清、Scenario Probe、General Probe 和多 Project 切换没有端到端回归；
- 重复问题、疲劳和会话节奏尚未进入实际 Policy。

## Policy 输入与顺序

Policy 只读取结构化状态：active Project、Topic、open Gap、Evidence、Competency coverage、矛盾、Turn 数和饱和度。

优先级为：

1. 澄清影响结论的矛盾；
2. 继续当前高价值 Gap；
3. 切换到当前 Project 的高信息 Topic；
4. 切换到剩余高价值 Project；
5. 用 Scenario 补核心 Competency；
6. 没有高价值 Gap 或达到硬上限时结束。

模型不能改变优先级、权重或停止条件。

## Skill 契约

每个 Skill 只需要定义：适用 Gap、目标证据、可用 Probe、停止条件和禁止行为。Skill 不保存 Session，不评分，也不直接生成多个问题。

核心 Skill 集合为：

| Skill | 验证目标 |
| --- | --- |
| `ownership-grill` | 区分个人贡献与团队成果 |
| `metric-audit` | 核对指标定义、基线、数据集和归因 |
| `failure-forensics` | 重建故障、假设、诊断、根因和预防 |

## 下一验收点

- 三个核心 Skill 均可由 Runtime 加载；
- 每个 Skill 在明确、模糊、否认和矛盾回答上有固定回归；
- Policy 能覆盖继续 Topic、切 Topic、切 Project、澄清矛盾、Scenario 和 Finish；
- 6–10 轮中没有重复主问题；
- 每次切换都能从 Trace 解释原因；
- 达到 Gap 解决条件后不继续追问同一证据。
