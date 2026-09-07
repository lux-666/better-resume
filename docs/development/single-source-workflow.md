# 单一来源与必要分层

维护规则：先确认两个调用者共享什么不变量，再决定是否合并。生命周期和用途不同的结构可以保留，但只能有一个事实来源与一套决定相同行为的规则。

## 当前共用边界

| 规则 | 唯一实现 | 调用者与约束 |
| --- | --- | --- |
| JD 要求原文行 | `requirementLines` | 通用 Role 与 Role Pack 共用；只去首尾空白、空行及完全重复行，不删编号、截断或改写。Role Pack 无法容纳的 JD 会明确降级，通用 Role 仍保留全部要求。 |
| 面试记忆摘要 | `buildSummary` | 进入 Interview Agent 前从当前 State 生成一次，同一对象用于输入与 summary_update Telemetry。摘要不写入 State，旧快照的 memory 缓存在加载时丢弃；Turn/Evidence 不变。 |
| Provider 重试 | `withOneProviderRetry` | 正常 Agent 与评测共用“只对 Provider 错误重试一次”；中止或业务校验失败不重试同一主模型。 |
| 备用模型 | `runModelStage` | 组合上述主模型重试与一次备用尝试；主阶段超时和整个命令中止是不同期限，后者不能再启用备用。所有模型只产出提案，提交仍由执行事务负责。 |
| 面试时长提醒 | `interviewTimeBudgetExhausted` | 到期提示与 Agent 输入共用；等于预算时即到期，不强制结束。轮次上限独立生效。 |
| 会话响应 | `InterviewStateResponseSchema` | Step Schema 扩展相同公共属性，两种 TypeScript 类型都从各自 Schema 推导，避免新增 metadata/pending 字段漏改另一轨。 |
| 岗位结论枚举 | `RequirementStatusSchema` | 矩阵与叙述层共用同一枚举；叙述内容另有引用范围和结论不得提升的业务校验。 |
| 页面会话切换 | `useInterviewSession` | 打开、恢复、清空和最近会话 localStorage 都由 hook 维护；表单只清理自身输入。 |
| 回答延迟 | `summarizeTelemetry().answerLatency` | API 与技术视图使用同一聚合结果；全部操作延迟与回答延迟是不同样本集合。 |
| 测试工具调用序列 | `packages/pi-runtime/src/test-helpers.ts` 的 `runtime` | knowledge/recall 测试共用响应序列到 faux provider 的映射；每次调用创建独立 provider 和 models。工具名、参数与顺序原样保留，各自的状态、检索数据、预算和断言仍由测试构造。 |

## 必要分层

**公共知识与单会话记忆。** 公共知识说明“某种机制可以怎样核验”，有来源版本和知识卡引用；会话记忆回忆“这个候选人在本次面试中说过什么”，有会话范围、删除边界与 Turn/Evidence 引用。它们共享 embedding 客户端和余弦计算，但索引发布与删除生命周期不同，不合并成一个可混查的库。

**通用 Role 与 Role Pack。** 通用四维是没有 JD、Demo 或计划生成失败时仍可工作的默认调查计划。Role Pack 是创建时冻结的 JD 映射及来源；它只在开访前投影为当前 Role/Report fields。面试执行统一读取当前字段，不存在两套提问循环，也不重新改写已开始的调查计划。

**事实报告与叙述。** 事实报告及岗位矩阵从已接受 State 确定性派生；叙述层只是引用这些事实的措辞，不可写回 Evidence 或改变结论。叙述失败时保留事实报告是降级能力，不是第二份事实。

## 三种“矛盾状态”为什么可以不同

- `Claim.status` 记录原始主张的累计核验结果；存在历史 invalidate 时保持 contradicted，即使后来解释清楚，也不能抹掉此前夸大的记录。
- `ReportField.status` 描述该调查字段最近一次 accepted edit 的结论；可由后来的具体支持变成 supported，并保留全部历史 Evidence。
- `ReportContradiction.status` 记录是否还有待澄清的说法。open 会阻塞正常结束；后续另一次回答的 Claim-linked 证据可将其标为 resolved。resolved 表示矛盾流程已收口，不表示原始主张被证明为真。同一回答不能解决自己刚创建的矛盾。

例如先声称“独立完成”，再明确“只负责接口联调”：原始 Claim 可以继续是 contradicted；职责字段可以是 weak；矛盾记录可以是 resolved。这三个值不能用一个布尔量替代。

岗位矩阵聚合的是当前关联字段：任一字段 contradicted 优先显示冲突；没有当前冲突才判断 supported/partial/weak。未决矛盾另由报告和结束校验处理。上述是当前保留的判定规则；更严格的语义澄清标准应单独评测，不能在结构重构中悄悄改变。

## 修改与验证流程

1. 用 `rg` 列出符号的生产、评测和测试引用，先确认是否真正重复。
2. 修改上表中的唯一实现；不同数据来源的生命周期仍由各自调用者处理。
3. 为边界补充行为测试。例如编号/长 JD 在两路径一致，旧摘要不影响报告，取消后不重试，状态与 Step 响应都接受同一 pending metadata。
4. 运行 `npm test` 与 `npm run build`。

`npm run check:duplication` 使用固定版本 jscpd，对 apps/packages 的生产 TypeScript/TSX 检测至少 70 token 的克隆，阈值为 0，已纳入 `npm test`。测试夹具允许各自构造独立场景，不为消除文本相似而抽象测试。检测范围不是语义证明；共享不变量另由 consolidation 合约测试保护。

`packages/pi-runtime/src/index.test.ts` 中的三组相似片段保留：正常编辑与遥测验证、否认主张修复与跨项目字段修复、正常提问与项目饱和后的切换。它们分别验证独立契约；响应重试次数、状态准备及断言应独立调整，不合并测试场景。

`npm test` 先执行 `typecheck`，通过 TypeScript 的 `noUnusedLocals` 和 `noUnusedParameters` 拒绝未使用导入、局部变量及参数。共享测试 runtime 的合约测试验证响应顺序与并发实例隔离。

`npx --yes knip@6.32.2 --include files,exports,duplicates,types --no-progress` 用于复核未使用导出。模块内部仍被引用的 Schema 和类型只收回 export，不删除定义。包入口保留的 core 类型、报告构建接口及 Agent/API Schema 是公共契约；`--include-entry-exports` 的候选需要先检查该边界，不能按仓库内调用数直接裁掉。工作区包虽通过相对路径导入，仍保留依赖声明；不能把扫描器的这类误报当成死依赖删除。
