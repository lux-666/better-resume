# Task 1.5-C：Model Routing

[返回 Phase 1.5](README.md)

## 目标

根据 1.5-A 的真实成本数据和 1.5-B 的质量基线，判断 Report Agent 与 Interview Agent 是否可以使用不同模型，并在不降低质量的前提下降低成本或延迟。

目标不是“必须上线动态路由”，而是得到可验证的 Go/No-Go 结论。

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
