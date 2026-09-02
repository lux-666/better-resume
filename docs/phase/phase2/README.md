# Phase 2：接入真实业务输入并交付 Candidate Report

[返回 Phase 索引](../README.md)

**状态：Ready — [Phase 1](../phase1/README.md) 已通过**

## 业务目标

让用户提交真实简历，系统基于目标岗位建立 Report contract，完成访谈，并输出所有结论都能回到 Resume Claim 或 Candidate Answer 的 Candidate Report。

## 为什么后做

Role、Resume 和 Report export 都是输入输出层。只有 Interview Agent 的行为通过 Phase 1，扩大输入范围才有产品价值。

## Task 2.1：Role Pack 驱动 Report contract

**目标：** 不再由 Core 为每个 Project 硬编码四个 Report field，同时不恢复问题路由 Policy。

**开发内容：**

- 在 Role Pack 中定义 required/optional Report field、Competency 和最低 Evidence 要求；
- Session 创建时生成可审阅的 Candidate Report contract；
- Completion Validator 按 contract 检查 required field；
- Agent 仍自行决定调查顺序、纵向深挖和问题表达。

**验收：** 至少两个 Role 使用同一 Core 生成不同 Report contract；相同 contract 和 Evidence 得到稳定完成判断。

## Task 2.2：最小 Resume 输入与确认

**目标：** 用真实 Resume 替换固定 Candidate Fixture，同时保留来源和用户纠错能力。

**开发内容：**

- 首版只支持粘贴文本和文本型 PDF；
- 提取 Candidate、Project、技术、结果和 Resume Claim；
- 每个 Claim 保存来源片段，初始状态均为 `unverified`；
- 面试开始前允许用户确认或修正解析结果；
- OCR、复杂版式和简历编辑器不在本 Phase 范围。

**验收：** 单 Project、多 Project、模糊归属三份固定简历可稳定解析；不存在无来源 Claim。

## Task 2.3：生成最终 Candidate Report

**目标：** 把 InterviewState 转成招聘方可读、可审计的最终交付物。

**开发内容：**

- 首版输出结构化 JSON 和 Markdown，不先做 PDF 模板系统；
- 展示 supported、weak、contradicted 和 missing 结论；
- 每个重要结论链接 Evidence ID、Question、Answer Quote 和 Project；
- 明确未验证、证据不足和已解决/未解决矛盾；
- 禁止把 Resume Claim 或模型总结单独当作证据。

**验收：** Report 中每个事实性结论都能自动追溯；删除任一引用 Evidence 后验证必须失败。

## Task 2.4：真实端到端发布 Gate

**目标：** 验证 `Resume → Report contract → Interview → Candidate Report` 是可恢复的完整产品流程。

**开发内容：**

- 覆盖创建、刷新恢复、Provider 重试、完成和 Report 导出；
- 复跑 Phase 1 行为 Gate，确保真实输入没有破坏 Agent 质量；
- 建立最小发布清单和失败回滚条件。

**验收：** 三份固定简历和三类候选人 Profile 全链路通过；Critical grounding 与数据隔离检查为 0 失败。

## Phase 退出标准

- 两个 Role、三份 Resume 和三类 Candidate Profile 通过端到端 Gate；
- Candidate Report 全部可追溯；
- 产品流程可以在进程重启和 Provider 可重试失败后继续。

## 完成后回填：具体实现与验证

Phase 完成后补充：

- **实现：** 实际交付的 Role contract、Resume parser、Report renderer 和 API/UI 变化；
- **验证：** 自动化、真实模型回归、固定简历和人工验收记录；
- **结果：** 发布结论、已知限制、剩余风险和对应代码/报告链接。

## 明确不做

在验收数据证明必要之前，不建设 utility 打分、持久化 Lead/Probe、Skill 自动路由、Multi-Agent、长期记忆、OCR、复杂 PDF 报告模板或 LLM-as-judge。
