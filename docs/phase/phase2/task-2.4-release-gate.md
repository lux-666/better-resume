# Task 2.4：真实端到端发布 Gate

[返回 Phase 2](README.md)

| 属性 | 结果 |
| --- | --- |
| 状态 | Go — 可发布 `v0.1.0` 本地 Demo |
| 日期 | 2026-09-02 |
| Provider | `openai_compatible` |
| Report / Interview 模型 | `gpt-5.6-terra` / `gpt-5.6-sol` |

## 场景结果

| 场景 | 输入结构 | 候选人行为 | 轮数 | Critical / Major | 报告建议 | 完整性 |
| --- | --- | --- | ---: | --- | --- | --- |
| `single-project-strong` | 单项目、完整 JD | strong | 4 | 0 / 0 | `continue_process` | Valid |
| `multi-project-contradictory` | 双项目、完整 JD | contradictory | 12 | 0 / 0 | `continue_with_verification` | Valid |
| `sparse-input-weak` | 单项目、无 JD、信息缺失 | weak | 4 | 0 / 0 | `insufficient_evidence` | Valid |

三个场景共完成 20 轮、86 次模型请求；Provider 错误和重试均为 0，输入 / 输出 Token 为 `133652 / 9554`，最大近似单次上下文为 `2496` Token。

## 发布检查

- `npm test` 55/55 通过，覆盖结构化 Intake、Session Role、HTTP Schema、进程恢复、Answer 租约和幂等重放、旧问题拒绝、Provider 单次重试及 Report JSON/Markdown 导出；
- `npm run build` 同时执行全仓类型检查和 Web 生产构建；
- `npm run eval:model -- release` 使用真实模型完成三个发布场景，并复用 Phase 1 Critical/Major Gate；
- strong 场景的四个维度均为 supported，问题逐项核验职责、方法、结果和异常处理；
- contradictory 场景的两个候选人输入 Claim 均先建立 contradiction，再通过独立澄清轮 resolved；报告保留更正后的职责边界，不把团队成果归给候选人；
- weak 场景没有把模糊回答升级为能力优势，报告明确证据不足且不形成岗位匹配结论；
- 所有 Evidence Quote 均能回到对应 Answer，所有报告均可从同一 State 生成结构化 JSON 和 Markdown；
- 逐轮审阅未发现引导性夸奖、复合问题、跨 Session 数据、无来源结论或阻塞性交互问题。

## Go 与剩余风险

`v0.1.0` 本地 Demo 发布结论为 **Go**。页面刷新、Server 重启和 Provider 可重试失败由自动化覆盖；真实模型链路证明结构化输入、会话岗位、访谈、报告和导出可以闭环。

当前结论不授权公开多租户服务：账户所有权尚未实现。报告仍使用四个跨岗位通用维度，不等价于逐条 JD 要求匹配；固定行为场景也不替代后续真实候选人样本积累。这两项不阻塞本地 Demo 发布。
