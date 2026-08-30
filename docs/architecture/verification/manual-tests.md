# 人工测试

[返回 Verification](README.md) · [返回架构 Map](../README.md)

人工测试分为两种：固定答案的系统走查现在可以执行；模型驱动的真人面试只有满足准入清单后才有评价意义。

## 固定答案系统走查

### 启动

要求 Node.js 22.19+。先执行自动检查：

```bash
npm install
npm test
npm run build
```

启动 API：

```bash
npm run dev
```

另开终端启动 Web：

```bash
npm run dev:web
```

打开 <http://localhost:5173>，创建 Demo Session 并开始面试。

### 固定输入

第一轮回答：

```text
我负责检索架构设计，并独立实现切分、召回和 reranker 接入。
```

第二轮回答：

```text
准确率按人工标注测试集上的正确回答比例计算，基线为未加 reranker 的版本。
```

### 通过标准

- 第一轮产生 Ownership Evidence，Quote 与输入逐字一致，并关联 Ownership Claim；
- Ownership Gap 关闭，下一决策切换到 Evaluation Topic；
- 第二轮产生 Evaluation Evidence，并关联 Metric Claim；
- Session 变为 `completed`，没有重复 Turn 或 Evidence；
- `GET /api/interviews/:id/state` 返回与页面结果一致的持久化 State；
- 重启 API 后再次读取同一 State，当前状态和引用不丢失。

这套走查只证明 Web、API、SQLite 和确定性 Domain 闭环，不证明模型提取质量或候选人能力判断有效。

## 模型驱动真人测试准入

以下条件必须全部满足：

- [ ] Pi Evidence Extraction 通过 Schema、ID、数值和 Quote 校验；
- [ ] 固定回归语料覆盖具体、模糊、否认、矛盾和无关回答；
- [ ] `ownership-grill`、`metric-audit`、`failure-forensics` 三个 Skill 可执行；
- [ ] Question Generation 每轮只产生一个主问题且不重复；
- [ ] Session 支持 6–10 轮，并覆盖继续、切 Topic、切 Project、矛盾澄清和结束；
- [ ] 强证据、弱证据、矛盾证据三个固定 Profile 全部通过；
- [ ] Provider 超时和一次重试不会丢失或重复 Session 数据；
- [x] UI 展示当前 Topic、Gap、Evidence 和 DecisionTrace；
- [ ] 每条 Evidence 和每个 Question 都能追溯到保存的 State；
- [ ] Domain、Model Contract、HTTP 自动化测试与固定答案走查全部通过。

清单未全部满足时，不进行候选人能力评价。此时可以继续做系统走查和内部模型回归。

## 真人测试协议

准入后使用 3–5 名内部测试者，每人完成 2 次 Session，至少覆盖强、弱和矛盾三类 Profile。每轮记录：

```text
sessionId
turnCount
completionTime
repeatedQuestionCount
unrelatedQuestionCount
invalidQuoteCount
incorrectTopicTransitionCount
providerFailureCount
testerPerceivedInterrogation: 1..5
testerNotes
```

每次失败必须能定位到原 Turn、Evidence、DecisionTrace、模型版本和持久化 State。没有完整追踪链的体验反馈只作为线索，不能直接驱动评分规则变化。
