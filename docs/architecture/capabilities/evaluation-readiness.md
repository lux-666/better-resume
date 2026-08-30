# Evaluation 与真人准入

[返回能力建设 Map](README.md) · [Verification 板块](../verification/README.md)

## 目标

分别验证确定性系统正确性、模型语义质量和真人对话质量。三类证据不能互相替代。

## 当前事实

- Core 测试覆盖固定两轮闭环和 Anchor/Gap 路由；
- Pi Runtime 测试覆盖结构化语料、非法 Quote、越界 ID 和越界数值；
- `npm test` 当前共 4 个测试；
- TypeScript 类型检查和 Web Production Build 可运行；
- 固定答案人工走查可验证 Web、API、SQLite 和 Domain 闭环；
- 没有真实模型语义提取回归；
- 没有 HTTP 幂等、并发和恢复自动测试；
- 没有 6–10 轮固定 Profile；
- 当前不具备对候选人能力结论做有效性评价的条件。

## 验证结构

```text
Domain determinism
  → Model contract and semantic corpus
  → HTTP durability and idempotency
  → deterministic manual conformance
  → fixed-profile model interviews
  → small-sample human interviews
```

模型语义语料固定 Answer 和期望 Evidence 边界，不要求逐字复现自然语言 statement，但必须稳定满足 polarity、Quote、Claim、Competency 和 Policy 断言。

真人测试只测系统已无法由固定语料回答的问题：追问是否自然、上下文是否连贯、问题是否重复、节奏是否像审讯、候选人是否理解问题。

## 当前阻断项

- Answer 主链未使用真实模型；
- Role Pack 没有行为锚点与覆盖阈值；
- 三个核心 Skill 未齐；
- Session 尚未支持可靠的 6–10 轮恢复；
- 强、弱、矛盾 Profile 没有端到端结果基线。

## 下一验收点

开放 3–5 名内部真人测试者之前，必须满足：

- Domain、Pi、HTTP 自动化套件全部通过；
- 三个固定 Profile 各完成至少一次 6–10 轮模型面试；
- 所有 Evidence 逐字可追溯，所有 Question 有完整 Trace；
- 超时、重试和进程重启不产生重复数据；
- 核心 Competency 的 coverage 与矛盾在结果中可见；
- 固定答案系统走查无阻断失败。

详细人工协议与记录字段见[人工测试](../verification/manual-tests.md)。
