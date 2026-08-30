# 自动化测试

[返回 Verification](README.md) · [返回架构 Map](../README.md)

## 标准命令

要求 Node.js 22.19+。

```bash
npm test
npm run build
```

`npm test` 执行 Interview Core 的 Node 原生测试；`npm run build` 同时执行 TypeScript 类型检查和 Web 生产构建。

## Domain 测试矩阵

| 行为 | 必须断言 |
| --- | --- |
| Anchor Project | 相同输入始终选择价值最高的 Project |
| Start | `draft → active`，选择最高信息增益 Topic，产生 Trace |
| Evidence 链接 | Evidence 引用原 Turn、Claim、Topic 和 Competency |
| Quote | `sourceQuote` 是 Answer 原文子串 |
| Claim 更新 | 只有关联 Evidence 改变 Claim 状态 |
| Competency 更新 | score、confidence、missingEvidence 和引用一致 |
| Gap 路由 | Gap 类型映射到正确 Skill |
| Topic / Project 切换 | 按 Policy 顺序切换且只有一个 active 目标 |
| 硬上限 | 单 Topic 和 Session 上限触发切换或完成 |
| Terminal | `completed` 状态拒绝 Answer |

现有自动化覆盖固定闭环和 Anchor/Gap 路由。上表其余项仍是 Domain 契约，合入对应实现时必须同时留下最小失败测试。

## Model Contract 语料

固定语料至少包含：

- 明确、具体且可引用的回答；
- 模糊回答；
- 否认个人 Ownership；
- 带指标、基线和测试集的回答；
- 与已有 Evidence 矛盾的回答；
- 与当前问题无关的回答。

每例断言 Schema、ID 范围、数值范围、`sourceQuote`、polarity 和后续 Policy。非法 Quote、虚构 Claim ID 和越界数值必须整项拒绝。

现有 Pi Runtime 测试已覆盖这六类输入的结构契约，以及非法 Quote、越界 ID 和越界数值的拒绝行为。语义提取与后续 Policy 断言在真实模型接入后由同一语料继续执行。

## HTTP / Persistence 测试

集成测试执行：

```text
create → start → answer → process restart → state reload
```

并断言：

- SQLite 中的 Turn、Evidence、Competency 和 Trace 与响应一致；
- 重复 Start 或重复 Answer 不产生重复数据；
- 并发 Answer 只有一个成功；
- 无效 Body 不改变 Session；
- Provider 超时后 Raw Turn 可恢复；
- 领域、模型和服务器错误映射到约定状态码。

## 失败标准

随机性、测试间共享 Session、只检查 Snapshot 而不检查引用关系，都会掩盖结构错误。测试数据使用固定语义和独立 Session；动态 ID 只验证存在性和引用一致性。
