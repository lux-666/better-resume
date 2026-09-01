# Interview Guardrails

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | Agent 主驾驶已经落地，确定性代码只负责护栏 |
| 已验证 | 完成请求拒绝、矛盾阻塞、Evidence grounding、单问题约束、重复问题拦截和 15 轮上限 |
| 主缺口 | 语义重复、疲劳和真实模型长程质量尚未评估 |
| 下一验收 | 真实模型能自然纵向深挖，同时在充分时可靠结束 |

具体设计见[Agent 决策与 Guardrail 契约](guardrails.md)。
