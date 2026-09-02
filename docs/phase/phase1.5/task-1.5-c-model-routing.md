# Task 1.5-C：Model Routing

[返回 Phase 1.5](README.md)

## 目标

根据 1.5-A 的真实成本数据和 1.5-B 的质量基线，判断 Report Agent 与 Interview Agent 是否可以使用不同模型，并在不降低质量的前提下降低成本或延迟。

目标不是“必须上线动态路由”，而是得到可验证的 Go/No-Go 结论。

**v0.1 产品结论：Go。** `Report=Terra / Interview=Sol` 静态分流已获准上线，依据是相对 Sol-only 的 token 降低 21.4% 和模型累计延迟降低 41.5%。旧 Gold 不是完整 multi-label，且三组走了不同面试轨迹，因此 Field precision 横向比较仍然无效；这意味着质量结论是 inconclusive，不意味着已证明 Terra 更差，也不再作为此次成本/时间优化的上线阻断项。

## 配置边界

Provider、凭据和默认线上模型仍使用已有配置。强弱模型角色只从 `.env` 读取：

```dotenv
LLM_WEAK_MODEL=gpt-5.6-terra
LLM_STRONG_MODEL=gpt-5.6-sol
```

生产静态分流使用：

```dotenv
LLM_REPORT_MODEL=gpt-5.6-terra
LLM_INTERVIEW_MODEL=gpt-5.6-sol
```

Server 会分别创建两个 runtime；Report edit 只使用 `LLM_REPORT_MODEL`，下一问题与结束决策只使用 `LLM_INTERVIEW_MODEL`。健康接口、页面运行状态、Telemetry model span 和 Step execution trace 均记录实际模型分工。

代码不内置具体模型 ID。更换模型时只改环境配置。`npm run eval:routing` 临时生成三种评测配置，不修改服务使用的 `LLM_MODEL`：

```text
weak_only   = Report weak  / Interview weak
strong_only = Report strong / Interview strong
static_split = Report weak / Interview strong
```

三种配置必须使用同一个 `LLM_PROVIDER`、`LLM_BASE_URL` 和凭据。

## v0.1 真实行为矩阵

运行日期：2026-09-02。Provider：`openai_compatible`。每种策略运行一次全部六个固定 Profile。

| 策略 | Profile | Critical / Major | Model requests | Input / Output | Cache read | Model latency |
|---|---:|---:|---:|---:|---:|---:|
| Terra / Terra | 6/6 passed | 0 / 0 | 176 | 262,103 / 23,097 | 0 | 781.3 s |
| Sol / Sol | 6/6 passed | 0 / 0 | 184 | 273,728 / 28,963 | 14,208 | 1,462.2 s |
| Terra / Sol | 6/6 passed | 0 / 0 | 148 | 216,755 / 21,180 | 1,024 | 854.8 s |

相对 Sol/Sol，static split：

- 模型请求减少 19.6%；
- input + output token 减少 21.4%；
- 模型累计延迟减少 41.5%；

相对 Terra/Terra，static split 减少 15.9% 请求和 16.6% token，但延迟增加 9.4%。

可以确认：三组旧行为 Gate 都通过，split 相比 Sol-only 有明确 token 和延迟改善。

不能确认：split 的真实 Field precision 更低，也不能确认 Terra Report 存在过度绑定。旧 Gold 除 `multi_field` Profile 外通常只标当前 Field，与 Report Prompt 的 multi-field 语义冲突；同时三组 Gold 总数分别为 45、45、38，证明输入轨迹不同。旧的 59.68% / 61.97% / 67.69% 仅作为已失效历史输出保留，不再用于模型质量归因。

因此自动质量比较结论仍是 inconclusive，但产品决策已接受这一证据边界并批准静态分流上线。上线理由仅限已验证的 token 与时间收益，不再声称已经完成 Terra/Sol 的真实质量排序。

机器可读汇总见 [routing-matrix-v0.1.json](results/routing-matrix-v0.1.json)。

## v0.1 的证据边界

- 这是固定 Profile 行为矩阵，不是严格 frozen-context replay；不同模型可能选择不同提问轨迹，因此 Gold 总数也不同；
- 每种策略只运行一次，不能据此估计稳定的 p50/p95；
- Question Quality 和 Follow-up Relevance 尚未完成人工 Rubric；
- OpenAI-compatible runtime 当前成本单价为 0，只能比较 token，不能计算真实金额；
- cache 数字来自 Provider adapter：Terra 报告 0、Sol 报告 14,208，尚不能仅凭这一次运行推断长期缓存能力；
- 当前 harness 以整组六 Profile 为不可恢复单元，单组耗时约 13–24 分钟；下一版应拆成 `strategy × profile × run` 独立结果，支持进度、恢复和重复运行。

严格 replay、重复运行和人工 Rubric 继续作为上线后的质量校准工作，不再是当前静态分流的前置 Gate。

## 修正后的评测链路

当前固定 Gold 已改为 material multi-label：一句回答对 mechanism、measurement、failure 等多个 Field 提供实质信息时，分别生成对应 Gold Evidence。系统不再把“当前提问 Field”当作唯一合法标签。

行为矩阵 runner 会把逐 Turn 明细写入 `data/evaluations/routing-matrix-*.json`：

```text
answer
expectedFieldIds / actualFieldIds
expectedClaimIds / actualClaimIds
```

Report Agent 的严格同输入比较使用：

```bash
npm run eval:routing:report-replay
```

该命令先生成一份确定性的 Report case corpus，再让 weak/strong 分别读取完全相同的 `InterviewState + answer`。随机 candidate、turn、evidence ID 和时间戳会被规范成稳定值；输出保存每个 case 的 fixture fingerprint、expected/actual disposition、Evidence、Field、Claim、polarity、source quote，以及两组首个 Model Request 的 context fingerprint。任一模型缺少 fingerprint、两组 fingerprint 不一致或调用失败时，评测直接失败。

当前 frozen corpus 共 46 个 Report cases，其中 8 个回答是 material multi-label。fixture fingerprint 在重复构建之间必须完全一致，这保证后续重复运行比较的是同一批输入，而不只是同一进程内临时共享的对象。

这只解决 Report extraction 的 frozen replay。Interview Question/Follow-up 质量仍需要相同 State snapshot 加人工 Rubric，不能用不同完整面试轨迹的 aggregate 分数替代。

## 不直接采用的规则

下面这类规则在 v0.1 不能直接上线：

```text
confidence < threshold → strong model
complex answer → strong model
```

原因：

- 当前 `evaluatorConfidence` 是被路由模型自己生成的，尚未与 gold accuracy 校准；
- `complex answer` 没有稳定、可测试的定义；
- cheap model 如果误判 confidence 或复杂度，Router 看不到真实错误；
- 用模型自己的不确定性决定是否相信模型，会形成循环论证。

这些字段可以作为离线特征保存，只有在 1.5-B 数据证明与真实错误相关后才能进入路由策略。

## 第一步：离线模型矩阵

使用 1.5-A 保存的冻结 State snapshot 和模型可见 Context，对相同输入重放：

| Agent | 候选配置 |
|---|---|
| Report Agent | cheap、strong |
| Interview Agent | cheap、strong |

比较：

- 1.5-B 全部质量指标；
- Critical/Major Gate；
- input、output、cache token；
- latency p50/p95；
- Provider/tool validation failure；
- fallback 发生率。

重放不能修改原 Session，所有候选模型必须从同一个冻结 State 和 Answer 开始。

## 第二步：先静态分工，再考虑动态路由

优先验证最简单的策略：

```text
Report Agent    → cheap primary
Interview Agent → strong primary
```

原因是 Report Agent 输出受 Schema、grounding 和 exact ID Validator 约束，较容易检测失败；Interview Agent 的信息价值和追问方向更难在线确定。

只有静态分工不能覆盖成本目标，并且 Evaluation 数据证明存在稳定可识别的场景差异时，才增加动态规则。

## 第三步：Strong fallback

Report Agent 的在线 fallback 只允许由机器可验证事件触发：

- Provider error；
- Agent 没有提交可接受的 `edit_report`；
- Tool/Validator failure 达到 cheap model 的纠错上限；
- 输出被 Critical grounding/ID contract 拒绝。

Interview Agent 默认保留 strong model。cheap Interview Agent 只有在离线矩阵和人工 Rubric 均达到基线后才可进入候选策略。

fallback 必须满足：

```text
cheap attempt 不修改 InterviewState
        ↓ failure
strong model 使用同一 frozen state / answer 重试
        ↓ accepted
只提交一次最终业务状态变化
```

## 路由记录

每次 Agent Span 增加：

- route policy version；
- eligible models；
- selected primary model；
- selected reason；
- fallback model；
- fallback reason；
- primary/fallback 各自 token、latency 和 error；
-最终采用哪个输出。

历史表现指相同 Agent、Profile/scenario 和版本上的聚合 Scorecard，不是候选人级长期记忆。

## Rollout

```text
offline replay
  → fixed Profile matrix
  → internal shadow/pilot
  → limited enablement
  → full enablement or rollback
```

Shadow 阶段只比较输出，不允许 cheap shadow 结果修改业务 State。

## Go/No-Go Gate

在开始实现 Router 前，必须根据 1.5-A/B 基线冻结：

- 允许的 Critical/Major failure 上限；
- Evidence precision/recall 下限；
- Question/Follow-up Rubric 下限；
- 目标 token/cost 降幅；
- 目标 latency 改善；
- 最大 fallback rate。

这些阈值不能在看到候选模型结果后倒推，否则就是调 Gate 迎合模型。

## 验收

- cheap/strong 在完全相同的冻结输入上完成离线矩阵；
- Routing 候选保持 Critical 0 和现有完整行为 Gate 3/3；
- 人工 Question Quality/Follow-up Relevance 不低于冻结基线；
- token/cost 或 latency 至少一项达到预先冻结的改善目标；
- fallback 不产生重复 Evidence、重复 Turn 或部分 State mutation；
- 每次路由和 fallback 都能在 Trace 中解释；
- 不达标时输出 No-Go，保持当前单模型配置，Phase 1.5-C 仍可完成。
