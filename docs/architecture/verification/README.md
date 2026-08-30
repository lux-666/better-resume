# Verification 板块

[返回架构 Map](../README.md)

Verification 证明四件不同的事：Domain 决策可重复、模型输出可审计、HTTP Session 可恢复、真实对话可用。任意一类通过都不能替代其他类别。

## 验证分层

| 验证面 | 回答的问题 | 执行方式 |
| --- | --- | --- |
| Domain | 状态、评分、路由是否确定且合法 | 纯自动化测试 |
| Model Contract | 提取与生成是否遵守 Schema 和引用规则 | 固定语料回归 |
| HTTP / Persistence | Session 是否可创建、更新和恢复 | API 集成测试 |
| Manual Conformance | UI、API、SQLite 和状态链能否完整走通 | 固定答案人工走查 |
| Human Interview | 问题质量和对话体验是否达到可评估水平 | 准入后的小样本真人测试 |

## 质量门

```text
Domain tests
  → Model contract corpus
  → HTTP durability tests
  → deterministic manual conformance
  → human interview eligibility
  → human interview protocol
```

顺序表示依赖，不表示项目阶段。真人测试必须建立在前四类证据上，否则测试者只是在替系统发现基础设施错误。

## 细节入口

- [自动化测试](automated-tests.md)：测试矩阵、命令和关键断言；
- [人工测试](manual-tests.md)：当前可跑的固定流程、真人测试准入与记录协议。
