# 系统结构与人工测试准入

> Status: Active design
> Scope: 从当前确定性 Demo 到可进行内部人工面试测试

## 1. 这套系统到底要证明什么

系统的核心不是“让 LLM 像面试官一样聊天”，而是：

> 每一问都针对一个明确的 Evidence Gap；每一个能力判断都能追溯到候选人的原始回答。

因此最短业务闭环固定为：

```text
Candidate Profile / Resume Claim
  → Evidence Gap
  → Interview Policy
  → Skill / Probe
  → Question
  → Raw Answer
  → Structured Evidence
  → Claim + Competency + Gap Update
  → Next Policy Decision
```

任何不能服务这条链的模块，暂时不建。

## 2. 当前状态

当前已经跑通：

```text
固定 RAG Profile
  → Ownership 第一问
  → Candidate Answer
  → 确定性关键词 Evidence
  → Claim / Competency / Gap 更新
  → SWITCH_TOPIC
  → Metric 第二问
  → FINISH
```

它能验证状态流、SQLite 持久化、API、Policy 和 UI，但不能验证真实面试质量。关键词提取器会把“出现某些词”误当作能力证据，只是临时替身。

## 3. 近期目标结构

```text
┌──────────────────────────────────────────────────────────┐
│ apps/web                                                 │
│ Session 创建 / 面试对话 / Evidence 与 Decision Trace     │
└──────────────────────────┬───────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼───────────────────────────────┐
│ apps/server                                              │
│ 输入校验 / Session 读取与保存 / 单轮编排 / 错误边界       │
└──────────────┬────────────────────────────┬──────────────┘
               │                            │
┌──────────────▼──────────────┐  ┌──────────▼──────────────┐
│ packages/interview-core     │  │ packages/pi-runtime     │
│ 确定性业务状态与策略         │  │ 语言理解与自然表达       │
│                              │  │                         │
│ apply Evidence              │  │ extract Evidence        │
│ update Claim/Competency/Gap │  │ generate Question       │
│ decide Next Action          │  │ stream Agent events     │
└──────────────┬──────────────┘  └──────────┬──────────────┘
               │                            │
┌──────────────▼──────────────┐  ┌──────────▼──────────────┐
│ SQLite                      │  │ roles/ + skills/         │
│ Raw Turn + Interview State  │  │ Rubric + 调查指令        │
└─────────────────────────────┘  └─────────────────────────┘
```

### 3.1 Web

只负责显示与输入：

- 创建和恢复 Session；
- 显示当前问题；
- 提交回答；
- 显示当前 Project、Topic、Evidence、Score、Confidence 和 Trace。

Web 不计算分数，不决定下一问，不保存业务真相。

### 3.2 Server

Server 是一次面试 Turn 的事务边界：

1. 校验请求并读取 Session；
2. 先保存 Raw Answer；
3. 调用 Pi 获取结构化 Evidence；
4. 校验 Evidence Schema 与 `sourceQuote`；
5. 调用 interview-core 更新状态并决策；
6. 生成下一问；
7. 原子保存 State 和 Decision Trace；
8. 返回当前状态。

模型超时、输出不合法或引用不存在时，本轮保留 Raw Answer，但不伪造 Evidence。最多重试一次，然后返回可恢复错误。

### 3.3 Interview Core

Interview Core 不知道 OpenAI、Claude、Spark 或 Pi Provider。它只接受已经通过校验的结构化结果，并执行：

- Anchor Project 选择；
- Topic 激活、饱和与切换；
- Evidence 与 Claim 关联；
- Competency Score / Confidence 更新；
- Evidence Gap 解析；
- 下一动作决策；
- Decision Trace 生成。

第一阶段继续保留一个文件和纯函数。只有出现第二种实现或单文件已经妨碍修改时才拆目录、类或接口。

### 3.4 Pi Runtime

Pi 近期只解决两个真实问题：

1. 将自由文本回答转换为结构化 Evidence；
2. 根据确定性的 Interview Decision 生成一个自然问题。

Pi 不直接修改 Interview State，不直接打分，不决定 Topic，不拥有数据库写权限。Skill 是 Pi 使用的调查指令，Policy 才决定选哪个 Skill。

Compaction、动态 Skill 热加载和复杂 Session Backend 等到 15 轮以上对话出现真实上下文压力后再加。

### 3.5 Role 与 Skill

`roles/llm_engineer/role.json` 已是岗位权重的事实来源，下一阶段把最小 Rubric 也放在同一 Role Pack。`skills/` 保存如何调查某类 Gap 的指令。

首个人工测试只需要：

- `ownership-grill`：验证个人贡献；
- `metric-audit`：验证量化结果；
- `failure-forensics`：验证真实排障过程。

第二个 Skill 接入时再实现通用加载；当前不建 Skill 类层级。

### 3.6 SQLite

内部测试阶段继续使用“一条 Session 保存完整 JSON State”的方案，因为它最容易保证整轮写入一致性。

满足以下任一条件才拆表：

- 需要跨 Session 查询 Evidence 或 Competency；
- 需要独立生成报告和统计；
- 单 Session 出现并发写；
- State JSON 的迁移已明显妨碍开发。

## 4. 不可破坏的数据规则

1. Raw Turn 只追加，不覆盖；Summary 不能替代原文。
2. Project 只存在于 `candidate.projects`，禁止重复状态源。
3. Evidence 必须包含 `turnId`、`claimIds`、`competencyId` 和原文 `sourceQuote`。
4. `sourceQuote` 必须是本轮 Answer 的原始子串；不是则拒绝该 Evidence。
5. Claim、Score 和 Confidence 只能由 Evidence 更新，不能由 Question 或简历自述直接加分。
6. Policy 是确定性代码；LLM 只能提出 Evidence 和自然语言问题。
7. 每个下一问必须有 Decision Trace：Gap、Action、Skill、Reason 和 Question。
8. 模型失败时允许“没有新 Evidence”，不允许编造补齐。

## 5. 单轮目标数据流

```text
POST /api/interviews/:id/answer
  │
  ├─ validate answer
  ├─ append Raw Turn
  ├─ Pi.extractEvidence(context)
  │    └─ structured result only
  ├─ validate schema + sourceQuote
  ├─ core.applyEvidence(...)
  ├─ core.updateCompetency(...)
  ├─ core.resolveGaps(...)
  ├─ core.decide(...)
  ├─ Pi.generateQuestion(decision)  # 第二阶段接入
  ├─ append Decision Trace
  ├─ save SQLite transaction
  └─ return state + question
```

Pi Evidence Extraction 的首版输出只需要：

```json
{
  "evidence": [
    {
      "claimIds": ["claim_rag_ownership"],
      "competencyId": "software_engineering",
      "statement": "候选人描述了本人负责的检索架构与实现。",
      "polarity": "support",
      "strength": 0.8,
      "specificity": 0.75,
      "evaluatorConfidence": 0.8,
      "sourceQuote": "我负责检索架构设计，并独立实现……"
    }
  ]
}
```

Topic Discovery、New Claim、Contradiction 暂不混入这个 Schema。先把一个输出做稳。

## 6. 开发阶段与人工测试准入

### Gate 0：技术闭环测试——现在就能跑

目的：验证页面、API、SQLite 和状态迁移，不评价 AI 判断质量。

当前准入状态：**已满足**。

人工步骤：

```bash
npm install
npm run dev
```

另开终端：

```bash
npm run dev:web
```

打开 <http://localhost:5173>，执行：

1. 创建 Demo Session；
2. 复制页面显示的 Session ID，再点击“开始面试”；
3. 第一问输入：`我负责检索架构设计，并独立实现切分、召回和 reranker 接入。`；
4. 检查 Ownership Evidence、Software Engineering Score 和 Metric 下一问；
5. 第二问输入：`准确率按人工标注测试集上的正确回答比例计算，基线为未加 reranker 的版本。`；
6. 检查 Session 结束、两条 Raw Turn、两条 Evidence 和两条 Trace。

通过条件：

- 页面无报错；
- 用 `GET /api/interviews/:id/state` 读取时数据仍存在；当前页面刷新恢复尚未实现；
- Evidence 的 `sourceQuote` 与输入完全一致；
- 第一轮是 `SWITCH_TOPIC`，第二轮是 `FINISH`；
- Claim、Gap 和 Competency 只更新一次且引用同一 Evidence ID。

### Gate 1：Evidence 质量人工测试——Pi 提取接入后

这是下一阶段。完成以下工作才能开始：

- Pi 进入 Answer 主路径；
- Evidence 使用强 Schema 校验；
- `sourceQuote` 子串校验；
- 模型名、Prompt 版本、Schema 版本写入 Trace；
- 超时、一次重试和无 Evidence 降级；
- 至少 12 条固定答案回归集：具体、模糊、否认经历、跑题各 3 条。

退出条件：

- 12 条输入全部不崩溃、不丢 Raw Answer；
- Schema 在一次重试内 100% 有效；
- Quote 可追溯率 100%；
- 不包含原回答内容的 Evidence 为 0；
- 至少 10/12 条的 polarity 与预期一致；
- 同一输入重复运行时，核心 Policy 结果稳定。

达到 Gate 1 后，可以让开发团队做 **Evidence 判断质量测试**，但仍不值得评价完整面试体验。

### Gate 2：完整人工面试体验测试——6 至 10 轮闭环后

开始真实的内部人工面试前，还必须完成：

- `ownership-grill`、`metric-audit`、`failure-forensics` 三个 Skill；
- Pi Question Generation 接入，但每轮仍只问一个问题；
- 至少 3 份固定 Profile，覆盖强、弱、矛盾经历；
- Topic 继续、切换和结束均有测试；
- 单 Session 支持 6–10 轮；
- UI 能看到当前 Topic、Evidence、Gap 和 Trace；
- 模型失败可重试，不破坏 Session。

建议首轮内部测试：3–5 人，每人 2 个 Session。记录：

- 重复问题次数；
- 与当前 Project 无关的问题次数；
- 无法追溯到原话的 Evidence 数；
- 人工认为不合理的 Topic 切换；
- 完成一轮所需时间；
- 候选人认为“像审讯”的具体轮次。

退出条件：

- 每个 Session 无崩溃、无数据丢失；
- 每条 Evidence 均可定位到 Raw Turn；
- 每个下一问均有 Gap 和 Trace；
- 每个 Session 重复或无关问题不超过 1 次；
- 3 名测试者都能在无开发者协助下完成 Session。

达到 Gate 2 后，才可以称为“可做人工面试体验测试”。

### Gate 3：有限外部试用——可靠性与报告完成后

外部试用前需要：

- 简历文本或结构化 JSON 输入，不要求 PDF；
- 简单 Evidence-backed Report；
- Session 删除和敏感数据清理；
- Prompt / Model / Rubric 版本固定；
- 至少 20 个自动回归 Session；
- 已知失败案例清单。

这一阶段仍是产品验证，不用于真实录用决策。Score 校准、跨岗位公平性和招聘效度是后续独立工作，不塞进当前 MVP。

## 7. 实现顺序

严格按下面顺序推进：

1. Pi 结构化 Evidence Extraction；
2. Schema、Quote、超时、重试和版本 Trace；
3. 12 条 Evidence 回归集，完成 Gate 1；
4. `metric-audit` 与 `failure-forensics`；
5. Pi Question Generation；
6. 6–10 轮与 3 个 Profile，完成 Gate 2；
7. 简历文本输入与简单报告，准备 Gate 3。

不并行建设 RAG、向量库、多 Agent、PDF 解析、PostgreSQL、权限系统或漂亮报表。

## 8. 何时引入被暂缓的组件

| 组件 | 现在不做的原因 | 引入条件 |
|---|---|---|
| RAG / Vector Store | 三个 Skill 和一个 Role 可直接放入上下文 | Role Pack 大到上下文选择出现可测问题 |
| PostgreSQL / 拆表 | SQLite JSON 足够保证单 Session 一致性 | 需要跨 Session 查询、并发写或统计 |
| Compaction | 当前只有两轮 | 15 轮以上出现上下文成本或遗忘 |
| 多 Agent | 一个 Pi 调用链足够 | 不同模型任务出现独立扩缩容或权限边界 |
| PDF Parser | 不能提升 Evidence 闭环可信度 | 结构化/纯文本简历输入已经稳定 |
| 贝叶斯评分 | 当前没有校准数据 | 有足够人工标注 Session 可做校准 |

## 9. 当前结论

- **今天可以跑 Gate 0**：验证技术闭环。
- **Pi Evidence Extraction 与 12 条回归通过后跑 Gate 1**：验证判断质量。
- **三 Skill、三 Profile、6–10 轮通过后跑 Gate 2**：验证完整人工面试体验。
- Gate 2 之前，不应把 Demo 的 Score 当成候选人能力判断。
