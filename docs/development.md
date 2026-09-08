# 开发与验证

先找决定行为的唯一实现，再修改调用者。以下边界跨多个调用点，改动应保持同一不变量；生命周期独立的公共知识和会话记忆、事实报告和叙述仍分别维护，见[架构](architecture.md)。

| 边界 | 唯一实现与约束 |
| --- | --- |
| JD 原文行 | `requirementLines`：通用 Role 与 Role Pack 共用，不删编号、截断或改写 |
| 面试摘要 | `buildSummary`：同一 State 派生对象用于模型输入与遥测，旧缓存加载时丢弃 |
| Provider 重试 | `withOneProviderRetry`：仅 Provider 错误重试一次，中止与业务校验失败不重试主模型 |
| 备用模型 | `runModelStage`：主阶段超时可备用，整个命令中止不可备用，最终提交仍走事务 |
| 时长 | `interviewTimeBudgetExhausted`：等于预算即提醒，不强制结束，轮次上限独立 |
| 会话响应 | `InterviewStateResponseSchema`：State 与 Step 共享属性，类型从 Schema 推导 |
| 岗位状态 | `RequirementStatusSchema`：矩阵和叙述使用相同枚举，叙述另验引用与结论边界 |
| 页面会话 | `useInterviewSession`：统一打开、恢复、清空与最近会话记录 |
| 回答延迟 | `summarizeTelemetry().answerLatency`：API 和 UI 共用，回答与全部操作是不同样本集合 |
| 测试工具序列 | `packages/pi-runtime/src/test-helpers.ts`：共用 faux provider 映射，实例、预算与断言各自独立 |

`Claim`、`ReportField` 与 `ReportContradiction` 的累计核验、当前结论、澄清流程不能合成一个状态。不要在结构整理中改变业务判定。

## 本地检查

```bash
npm test
npm run build
```

`npm test` 包含 TypeScript、生产代码重复检测和行为测试。`noUnusedLocals`、`noUnusedParameters` 拒绝未使用局部定义；`npm run check:duplication` 使用固定 jscpd 5.0.16，检测 apps/packages 中至少 70 token 的生产代码克隆，阈值为零。测试场景不为消除相似文本而强行抽象。

跨文件修改前用 `rg` 区分生产、测试、评测和公共入口引用。可用 `npx --yes knip@6.32.2 --include files,exports,duplicates,types --no-progress` 辅助检查未使用导出；相对路径导入的工作区依赖和对外入口不能仅按扫描器报告删除。

行为测试重点覆盖 Evidence grounding、非法引用、完成与暂停边界、工具顺序、单问题、幂等、失败恢复、会话隔离及检索降级。单元测试通过不证明真实模型的提问质量。

## 模型评测

以下命令使用 `.env` 的真实模型，结果写入忽略提交的 `data/evaluations/`：

| 命令 | 样本与用途 |
| --- | --- |
| `npm run eval:model -- strong` | 固定强回答 Profile；另有 weak、contradictory 等 Profile |
| `npm run eval:model -- release` | 单项目、多项目、稀疏输入的端到端场景 |
| `npm run eval:routing` | low/high/静态分工的模型矩阵，不同访谈轨迹不可直接证明质量等价 |
| `npm run eval:routing:report-replay` | 相同冻结 State 与回答对比 Report 模型 |
| `npm run eval:phase3` | 深度、人设、叙述及观测的固定样本 |
| `npm run eval:phase4` | 一个合成 JD 和三项目 14 轮冻结记忆样本 |

知识检索与提问对照命令见[知识库](../knowledge/README.md)。记录质量、调用次数、上下文、失败与延迟，不能只凭少量成功样本宣布质量不下降或完成真人准入。人工复核应检查漏追、语义重复、Evidence 错配、过早结束与报告可用性。模型自报 confidence 不是校准概率；Provider usage 缺失被适配器归一为零时，不能据此宣称缓存未命中。

不要提交 `.env`、会话数据库、原始简历、私人回答、临时评测输出或中间稿。参赛成稿及其公开实验依据集中在 `docs/competition/`。
