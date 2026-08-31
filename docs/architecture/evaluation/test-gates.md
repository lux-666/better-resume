# 自动化、人工走查与准入门槛

[返回 Evaluation 板块](README.md) · [返回架构 Map](../README.md)

## 当前事实

`npm test` 当前执行 13 个产品行为测试和 1 个架构结构测试：HTTP 幂等/旧问题拒绝、可执行 API Schema、Core 的固定闭环与矛盾路由、Pi 的语义、单次格式重试与自然问题契约，以及文档层级检查。TypeScript 检查、Web Production Build 和固定答案系统走查可运行。

当前没有真实模型语义回归、HTTP 进程恢复/多进程并发测试或 6–10 轮固定 Profile，因此不能对候选人能力结论做有效性评价。

## 验证顺序

```text
Domain determinism
  → Model contract and semantic corpus
  → HTTP durability and idempotency
  → deterministic manual conformance
  → fixed-profile model interviews
  → small-sample human interviews
```

## 自动化

标准命令：

```bash
npm test
npm run build
```

Domain 测试必须覆盖 Anchor、Start、Evidence/Claim 链接、Quote、Competency 更新、Gap 路由、Topic/Project 切换、硬上限和 terminal rejection。

模型语料至少覆盖具体、模糊、否认 Ownership、指标、矛盾和无关回答。断言 Schema、上下文 ID、数值范围、Quote、polarity 和后续 Policy；非法 Quote、虚构 ID 和越界数值必须拒绝。

HTTP 测试执行：

```text
create → start → answer → process restart → state reload
```

并断言 State 与 SQLite 一致、重复命令不重复数据、并发 Answer 只有一个成功、非法 Body 不改变 Session、Provider 超时后 Raw Turn 可恢复、错误映射符合契约。

测试使用独立 Session 和固定语义。动态 ID 只验证存在性与引用一致性，不用整份 Snapshot 隐藏结构错误。

## 固定答案系统走查

要求 Node.js 22.19+。先执行：

```bash
npm install
npm test
npm run build
```

分别启动：

```bash
npm run dev
npm run dev:web
```

打开 <http://localhost:5173>，创建并开始 Demo Session。第一轮输入：

```text
我负责检索架构设计，并独立实现切分、召回和 reranker 接入。
```

第二轮输入：

```text
准确率按人工标注测试集上的正确回答比例计算，基线为未加 reranker 的版本。
```

通过标准：

- 第一轮产生逐字 Ownership Evidence 并关联 Claim；
- Ownership Gap 关闭并切换到 Evaluation；
- 第二轮产生 Metric Evidence 并关联 Claim；
- Session 完成且没有重复 Turn/Evidence；
- State API 与页面一致，API 重启后引用不丢失。

该走查只证明 Web、API、SQLite 和确定性 Domain 闭环，不证明模型或评估质量。

## 真人测试准入

以下条件必须全部满足：

- [x] Pi Extraction 通过 Schema、上下文和 Quote 校验并进入 Answer 主链；
- [ ] 模型语义语料覆盖具体、模糊、否认、矛盾和无关回答；
- [ ] `ownership-grill`、`metric-audit`、`failure-forensics` 可执行；
- [ ] Question Generation 每轮只产生一个不重复主问题；
- [ ] Session 支持可恢复的 6–10 轮和全部 Policy 转换；
- [ ] 强、弱、矛盾三个固定 Profile 通过；
- [ ] Provider 超时与重试不丢失或重复数据；
- [x] UI 展示 Topic、Gap、Evidence 和 DecisionTrace；
- [x] Evidence 与 Question 全部可追溯到 State；
- [ ] Domain、Pi、HTTP 自动化与固定答案走查全部通过。

## 真人测试协议

准入后使用 3–5 名内部测试者，每人完成 2 次 Session，覆盖强、弱和矛盾 Profile。每轮记录 sessionId、turnCount、completionTime、重复/无关问题数、非法 Quote 数、错误 Topic 转换数、Provider 失败数、1–5 分审讯感和备注。

每次失败必须能定位到原 Turn、Evidence、DecisionTrace、模型版本和 State。没有完整追踪链的体验反馈只作为线索，不能直接驱动评分规则变化。
