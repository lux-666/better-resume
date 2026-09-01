# Phase 1：建立真实模型评测与优化闭环

[返回 Phase 索引](../README.md)

**状态：Planned**

## 业务目标

证明同一个真实模型能够稳定完成 conversation-driven investigation：会利用上一轮新线索纵向深挖，会正确维护 grounded Candidate Report，也能在信息充分时结束。

现有自动化只证明 Schema、Core、工具和持久化正确，没有证明 Agent 会问对问题。因此本 Phase 先建立行为 Gate，再允许修改 Agent，最后用小规模真人测试验证自动化覆盖不到的体验问题。

## Tasks

| Task | 优先级 | 依赖 | 交付结果 |
| --- | --- | --- | --- |
| [1.1 建立行为评测语料](task-1.1-evaluation-corpus.md) | P0 | 无 | 可重复运行的高信号 Profile 集合 |
| [1.2 建立真实模型行为 Gate](task-1.2-model-behavior-gate.md) | P0 | 1.1 | 一个命令产生明确通过/失败结论 |
| [1.3 失败驱动优化 Agent](task-1.3-failure-driven-optimization.md) | P0 | 1.2 出现真实失败 | 最小修复及对应回归断言 |
| [1.4 小规模内部体验验收](task-1.4-internal-pilot.md) | P1 | 1.2 通过 | 真人体验结果和阻塞问题 Transcript |

执行顺序为 `1.1 → 1.2 → 1.3`；行为 Gate 通过后执行 1.4。Task 1.3 没有失败样本时不启动。

## Phase 退出标准

- 真实模型行为 Gate 使用同一配置连续三次通过；
- Critical 安全和 grounding 指标为 0 失败；
- 内部测试没有阻塞性问题；
- 满足后才允许启动 [Phase 2](../phase2/README.md)。

## 完成后回填：具体实现与验证

Phase 完成后汇总各 Task 的完成记录：

- **实现：** 实际修改的 Runner、Profile、Prompt、Schema 或 Validator；
- **验证：** 使用的模型配置、自动化命令和内部测试范围；
- **结果：** 通过率、失败分类、剩余风险和代码/报告链接。
