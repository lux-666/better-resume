# Phase 1：建立真实模型评测与优化闭环

[返回 Phase 索引](../README.md)

**状态：Completed — 真实模型 Gate 3/3，内部 Pilot Go**

## 业务目标

证明同一个真实模型能够稳定完成 conversation-driven investigation：会利用上一轮新线索纵向深挖，会正确维护 grounded Candidate Report，也能在信息充分时结束。

现有自动化只证明 Schema、Core、工具和持久化正确，没有证明 Agent 会问对问题。因此本 Phase 先建立行为 Gate，再允许修改 Agent，最后用小规模真人测试验证自动化覆盖不到的体验问题。

## Tasks

| Task | 状态 | 优先级 | 依赖 | 交付结果 |
| --- | --- | --- | --- | --- |
| [1.1 建立行为评测语料](task-1.1-evaluation-corpus.md) | Completed | P0 | 无 | 可重复运行的高信号 Profile 集合 |
| [1.2 建立真实模型行为 Gate](task-1.2-model-behavior-gate.md) | Completed：连续完整门禁 3/3 | P0 | 1.1 | 一个命令产生明确通过/失败结论 |
| [1.3 失败驱动优化 Agent](task-1.3-failure-driven-optimization.md) | Completed | P0 | 1.2 出现真实失败 | 最小修复及对应回归断言 |
| [1.4 小规模内部体验验收](task-1.4-internal-pilot.md) | Completed：2/2 Session，Go | P1 | 1.2 通过 | 真人体验结果和阻塞问题 Transcript |

执行顺序为 `1.1 → 1.2 → 1.3`；行为 Gate 通过后执行 1.4。Task 1.3 没有失败样本时不启动。

## Phase 退出标准

- 真实模型行为 Gate 使用同一配置连续三次通过；
- Critical 安全和 grounding 指标为 0 失败；
- 内部测试没有阻塞性问题；
- 满足后才允许启动 [Phase 2](../phase2/README.md)。

## 完成后回填：具体实现与验证

Phase 1 已完成：

- **实现：** 六个固定 Profile、确定性行为 Gate、结构化失败输出，以及由真实失败驱动的最小 Prompt、Schema 和工具反馈修复；
- **验证：** `openai_compatible / gpt-5.6-terra` 使用同一配置连续三次运行 `npm run eval:model -- all`，每次六个 Profile 全部通过；
- **结果：** Task 1.2 行为 Gate 达到 3/3，Task 1.3 的失败样本均有回归断言；Task 1.4 完成 P01-A/B 两个真实模型 Session，Critical 0、阻塞 Major 0，产品负责人结论为 Go；
- **限制：** Pilot 为一名产品负责人的两 Session 定性验收，真人未覆盖 Claim 否认/澄清和偏题恢复；详见 [Pilot Summary](task-1.4-pilot-summary.md)。
