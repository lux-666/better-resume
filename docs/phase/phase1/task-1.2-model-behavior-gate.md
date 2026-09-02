# Task 1.2：建立真实模型行为 Gate

[返回 Phase 1](README.md)

| 属性 | 值 |
| --- | --- |
| 状态 | Completed；连续完整门禁 3/3 |
| 优先级 | P0 |
| 依赖 | Task 1.1 |

## 目标

把现有 `eval:model` 从演示脚本改成发布 Gate：同一模型和配置运行后必须给出明确退出码、结构化结果和最小失败 Transcript，让 Prompt 或 Guardrail 变更可以被客观回归。

## 开发范围

### 每轮记录

- Profile、provider、modelId 和轮次；
- Question、targetFieldId 和 Agent reason；
- Answer disposition、Report edit 和 Evidence sourceQuote；
- `finish_interview` 请求、Completion Validator 结果和 blockers；
- Provider 错误与 retryCount。

### 自动 Gate

| 级别 | 检查 | 通过标准 |
| --- | --- | --- |
| Critical | sourceQuote 不在对应 Answer | 0 |
| Critical | 未知 Claim/Report field/Competency 引用 | 0 |
| Critical | open contradiction 时完成 | 0 |
| Critical | required field missing 时正常完成 | 0 |
| Critical | 超过 15 轮 | 0 |
| Major | 标准化后重复问题 | 0 |
| Major | vague 被升级为 supported | 0 |
| Major | vertical-depth 未追任何场景关键词 | 0 |
| Major | Report 充分后仍无效追问至硬上限 | 0 |

纵向深挖首版使用 Profile 明确提供的关键词或状态断言，不引入第二个模型评分。

## 命令契约

- 保留 `npm run eval:model -- <profile|all>`；
- 全部通过时退出码为 0；
- 任一 Gate 失败时退出码非 0；
- 标准输出给出摘要；失败详情只包含最小可复现 Transcript；
- 不在日志中输出 API Key 或无关候选人数据。

## 建议代码触点

- `apps/server/src/evaluate-profiles.ts`
- `package.json`（仅当现有命令不能满足时修改）
- Runner 对应测试

## 交付物

- 可用于 CI 或本地发布检查的真实模型 Gate；
- 每个 Profile 的结构化结果；
- 失败分类和最小 Transcript。

## 验收标准

- 故意制造每一类 Critical/Major 违规时，Runner 返回非 0；
- 全部 Profile 通过时返回 0；
- 相同模型配置连续运行三次全部通过，才能记录为 Phase Gate 通过；
- Provider 不可用与模型行为失败使用不同失败分类；
- `npm test`、`npm run typecheck`、`npm run build` 继续通过。

## 不做

- 独立评测服务；
- Dashboard；
- LLM-as-judge；
- 跨模型排行榜和成本优化。

## 完成后回填：具体实现与验证

- **实现：** 新增纯确定性行为 Gate，覆盖 grounding、引用、完成、轮次、重复、vague promotion、multi-field、vertical-depth、evasive 和 contradiction；`eval:model` 运行全部六 Profile，输出逐轮结构化记录、失败分类、最小 Transcript 和稳定退出码。OpenAI-compatible Provider 使用 Responses adapter。
- **验证：** Gate 单测故意制造 Critical/Major 违规并确认拒绝；Runner 对 Provider、model output 和 runtime 使用不同分类及退出码，并在失败时输出 Profile、阶段和最小 Transcript。`npm test`、`npm run typecheck`、`npm run build` 全部通过。
- **结果：** 在最后一次行为修复后，使用同一配置连续三次运行 `npm run eval:model -- all`；strong、weak、contradictory、multi-field、vertical-depth、evasive 在三次完整运行中全部 `passed`，进程退出码均为 0。当前验收计数为 **3/3**。
- **模型配置：** `openai_compatible / gpt-5.6-terra`，实验 Key 仅保存在本地环境，不写入日志或文档。一次 `Connection error` 被正确分类为 Provider 失败且不计入行为连续次数。
- **代码/报告链接：** [Runner](../../../apps/server/src/evaluate-profiles.ts)；[Gate](../../../apps/server/src/evaluation-gates.ts)；[Gate 测试](../../../apps/server/src/evaluation-gates.test.ts)。
