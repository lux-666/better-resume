# Task 1.4 Pilot Summary

[返回 Task 1.4](task-1.4-internal-pilot.md)

## 结论

**Go。** 产品负责人确认 P01-A、P01-B 两个真实模型 Session 的整体体验没有阻塞问题；自动审计未发现 grounding、引用、完成条件、数据隔离或 contradiction 状态违规。Phase 1 可以结束，Phase 2 可以启动。

本结论是两 Session 的小样本定性验收，不等同于多测试者可用性研究。

## 测试范围

| Session | 场景 | 状态 | 轮数 | 时长 | Evidence |
| --- | --- | --- | ---: | ---: | ---: |
| P01-A | 强回答与项目深挖 | completed | 3 | 8.66 分钟 | 15 |
| P01-B | 弱回答与证据边界 | completed | 9 | 25 分钟 | 21 |

- 测试者：1 名产品负责人；
- 模型：`openai_compatible / gpt-5.6-terra`；
- 数据库：隔离的 `data/phase1-pilot/pilot.db`；
- 原始 JSON：`data/phase1-pilot/phase1-pilot-<sessionId>.json`，由 Git 忽略；
- 测试中没有人工修改 `InterviewState`、Evidence、Question 或 Completion 结果。

## 自动审计结果

两份 Session JSON 均满足：

- `status=completed`；
- Evidence `sourceQuote` 不在对应 Answer：0；
- unknown Claim：0；
- unknown / incompatible Report field：0；
- open contradiction：0；
- required field missing：0；
- Runtime 与 Phase 1 Gate 基线一致。

## 定性复核

### P01-A

- 能从长回答中抽取多个 grounded Evidence；
- ownership、mechanism、measurement 和 failure 边界总体合理；
- 缺少量化数据时 measurement 保持 weak，没有由模型补写；
- 工具重复调用案例形成了现象、日志定位、根因和修复链路；
- 3 轮完成，没有无效拖延。

观察项：第一轮回答明确出现 `hybrid retrieval` 和 reranker，但下一问切到客服 Agent，没有立即沿该命名机制纵向追问。按 Pilot 协议属于一次 Major 类型观察，但只出现于一个 Session，且没有阻止 Report 完成，因此不构成阻塞 Major。

### P01-B

- Agent 连续追问 reranker 的模型、部署位置、TopK/TopN 和延迟取舍，体现了纵向深挖；
- 候选人“不清楚”“不记得”的回答保持为 weak；
- RAG failure 只记录候选人明确陈述的失败模式：embedding 命中相关主题但未命中准确段落；
- 5 秒到 3.5 秒的结果虽有数值，但因缺少样本量、统计周期和口径，measurement 最终保持 weak；
- 9 轮完成，没有为了结束而把弱证据升级为 supported。

覆盖限制：测试者没有实际执行场景卡预设的 Resume Claim 否认、后续澄清和一次故意偏题，因此 contradiction lifecycle 与偏题恢复没有得到真人 Session 覆盖；它们仍由 Task 1.2 的 contradictory 和 evasive Profile 自动 Gate 覆盖。

## Findings

| 级别 | 数量 | 结论 |
| --- | ---: | --- |
| Critical | 0 | 无 grounding、数据隔离或非法完成问题 |
| 阻塞 Major | 0 | 没有跨两个 Session 重复的问题，也没有导致 Session 无法完成的问题 |
| 非阻塞 Major 观察 | 1 | P01-A 一次命名检索线索未立即追问 |
| Minor | 0 | 产品负责人未报告需要记录的措辞或体验问题 |

## Go 的依据

- 产品负责人明确认为两个 Session 没有阻塞体验问题；
- Critical 为 0；
- 没有重复或严重的 Major；
- 两个 Session 都有数据库记录和独立 JSON 快照；
- Candidate Report 的强、弱边界与逐字 Evidence 经人工复核合理；
- Phase 1 真实模型固定 Gate 已在相同配置下连续 3/3 通过。

## 保留风险

- 只有一名测试者、两个 Session，不能估计测试者间差异；
- 真人 Pilot 未覆盖 Claim 否认/澄清和偏题恢复；
- P01-A 出现一次未重复的纵向漏追；
- 当前结论只适用于现有固定 Candidate Fixture、Role 和模型配置；Phase 2 接入真实 Resume 后必须重新做端到端 Gate。
