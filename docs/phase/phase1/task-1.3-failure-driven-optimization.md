# Task 1.3：失败驱动优化 Agent

[返回 Phase 1](README.md)

| 属性 | 值 |
| --- | --- |
| 状态 | Planned，只有 Gate 出现真实失败时启动 |
| 优先级 | P0 |
| 依赖 | Task 1.2 的失败样本 |

## 目标

只修复真实模型 Gate 已复现的问题，并为每个修复留下回归断言。禁止凭感觉继续扩展 Interview State 或增加调度机制。

## 处理流程

1. 保存最小失败 Transcript 和模型配置；
2. 将失败归入唯一主类别；
3. 在最低层修复根因；
4. 增加能在修改前失败、修改后通过的断言；
5. 运行单 Profile、全部 Profile 和仓库测试；
6. 在本 Task 的完成记录中写明结果。

## 失败分类与默认修复层

| 分类 | 典型问题 | 默认先改 |
| --- | --- | --- |
| Report edit | 漏字段、错误 polarity、虚构 Evidence | `edit_report` instruction 或 Schema |
| 调查选择 | 漏追具体线索、机械枚举字段 | `decideNextStepWithAgent` instruction |
| 问题表达 | 多问题、重复、泄露内部术语 | Question Guard；仅确定性违规进入 Core |
| 完成判断 | 过早结束或无效拖延 | Completion Validator 或 finish tool feedback |
| Provider 运行 | 超时、短暂失败、无工具调用 | Runtime retry/error handling |

如果 Prompt 已能稳定修复，不增加持久化状态；如果问题属于事实完整性、安全或不可协商的产品边界，才加入 deterministic Validator。

## 交付物

- 每个失败一个最小修复；
- 每个修复一个回归断言；
- 更新后的真实模型 Gate 结果；
- 没有必要修复时，Task 保持 Planned，不制造工作。

## 验收标准

- 原始失败 Transcript 可以证明修改前失败；
- 修改后目标 Profile 连续三次通过；
- 全部 Profile 无回归；
- 没有通过删场景、放宽 grounding、提高硬上限或隐藏失败来通过 Gate；
- 没有新增 Lead、Probe、utility、Skill 路由或 Multi-Agent 状态机；
- `npm test`、`npm run typecheck`、`npm run build` 通过。

## 不做

- 没有失败样本的 Prompt“优化”；
- 为单个措辞差异增加硬编码问题；
- 新的 Agent 框架或第二套状态；
- 与当前失败无关的重构。

## 完成后回填：具体实现与验证

- **失败 Transcript：**
- **根因：**
- **实现：**
- **回归验证：**
- **全部 Gate 结果：**
- **代码/报告链接：**
