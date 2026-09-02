# Phase 1.5：Agent 可观测、评测与模型路由

[返回 Phase 索引](../README.md)

**状态：1.5-A / 1.5-B v0.1 已实现；1.5-C 静态分流已获准上线**

## 业务目标

在接入真实 JD、Resume 和动态 Report contract 前，先让当前 Agent 链路回答三个问题：

1. 每次模型调用实际发送了什么规模的上下文、花了多少时间和 token、在哪里失败；
2. 输出是否真的提高了面试和 Evidence 质量，而不只是成功返回 Tool Call；
3. 哪些调用可以安全使用更快、更便宜的模型，哪些必须保留强模型。

## Tasks

| Task | 状态 | 依赖 | 交付结果 |
|---|---|---|---|
| [1.5-A Observability](task-1.5-a-observability.md) | Implemented v0.1 | Phase 1 | SQLite 独立 Trace、Agent / Model / Tool / State Span、usage 和错误链路 |
| [1.5-B Evaluation](task-1.5-b-evaluation.md) | Implemented v0.1 | 1.5-A | Gold-based 自动 Scorecard、人工 Rubric 空槽和 JSON / Markdown 输出 |
| [1.5-C Model Routing](task-1.5-c-model-routing.md) | Implemented / Go | 1.5-B | Report=Terra、Interview=Sol；相对 Sol-only token -21.4%、模型延迟 -41.5% |

执行顺序固定为：

```text
1.5-A Observability
  → 获得真实成本、延迟和失败数据
1.5-B Evaluation
  → 建立可比较的质量基线
1.5-C Model Routing
  → 先离线比较，再决定是否启用
```

## 关键边界

- `InterviewState` 仍是业务事实的唯一权威状态；Telemetry 单独保存，不参与面试决策；
- 不持久化 Chain-of-Thought；默认不复制完整 Prompt、Answer 或 `sourceQuote` 到 Trace；
- Provider usage 缺失时记录 `unavailable`；若 adapter 已把缺失值归一为 0，则先验证 adapter 语义，不把该 0 直接解释为缓存未命中；
- v0.1 不使用未经校准的模型自报 confidence 直接路由；当前上线的是环境配置驱动的静态分工；
- 旧质量矩阵结论仍是 inconclusive；本次产品决策明确以已验证的时间和 token 收益批准静态分流，后续 frozen replay 用于继续校准质量，不作为当前上线阻断项。

## Phase 退出标准

- 任意固定 Profile 的一次 Turn 能还原完整 Trace、Agent Span、Model Request、Tool 和 State update 顺序；
- 当前模型在固定 Profile 上形成质量、token、cache、latency 和 error 基线；
- Routing 候选通过相同质量 Gate，或形成有数据支持的 No-Go 结论；
- `npm test`、typecheck 和 build 通过；
- 完成后才启动 [Phase 2](../phase2/README.md)。
