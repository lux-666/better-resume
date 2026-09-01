# 自动化、人工走查与准入门槛

[返回 Evaluation 板块](README.md) · [返回架构 Map](../README.md)

## 自动化

```bash
npm test
npm run typecheck
npm run build
```

测试必须覆盖：

- Candidate Report 初始化、grounded multi-field edit、Claim/Competency 更新；
- Agent 可自由选择调查字段，Core 不做问题路由；
- `finish_interview` 在重要字段 missing、Project 无 Evidence或矛盾 open 时被拒绝；
- 强、弱、矛盾 Profile 在 15 轮内结束且 Report 可审计；
- `read_report → edit_report` 和 `read_report → ask_candidate / finish_interview` 工具顺序；
- 非法 Quote、虚构 ID、Competency 不匹配、多个问题、重复问题和 rubric 泄露被拒绝；
- Answer 幂等、进程恢复、旧问题拒绝和 Provider 单次重试。

自动化不证明真实模型的调查质量。

## 真实模型门槛

同一模型依次运行 strong、weak、contradictory Profile：

- 每个 Session 最多 15 轮；
- 不重复主问题；
- 能沿具体技术线索纵向深入，而非机械枚举 Report field；
- 所有 Evidence 有逐字 Quote；
- weak 信息保留为 weak，不被补写成 supported；
- open contradiction 未解决时不得结束；
- Report 充分后主动调用 `finish_interview`。

## 真人准入

真实模型门槛通过后，使用 3–5 名内部测试者，每人完成两次 Session。记录完成时间、轮数、重复/无关问题、Evidence 错配、过早结束、审讯感和 Report 可用性。任何 grounding 违规或跨候选人数据泄露立即停止测试。
