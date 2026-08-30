# Interview Policy 与 Skills

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | 两个 Topic 可闭环，其余 Policy 动作未端到端验证 |
| 已验证 | Project/Topic/Gap 路由、DecisionTrace、Ownership → Metric 两轮闭环 |
| 主缺口 | 只有一个 Skill；矛盾、Scenario 和多 Project 路由未端到端验证 |
| 下一验收 | 三个核心 Skill 和全部 Policy 动作通过 6–10 轮固定回归 |

Policy 决定调查什么，Skill 定义如何调查，Agent 负责如何表达。三者不能互相越权。

具体设计见[状态机、Policy 与 Skill 契约](policy-and-skills.md)。
