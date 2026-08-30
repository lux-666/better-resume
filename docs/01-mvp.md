# MVP：证据驱动问答闭环

> Status: deterministic demo complete; production Evidence Extraction pending.

## 目标

证明一件事：候选人的回答能够产生可追溯 Evidence，改变 Competency State 和 Evidence Gap，并确定下一问。

```text
Fixture Profile
  → First Question
  → Candidate Answer
  → Structured Evidence
  → Competency Update
  → Gap Analysis
  → Policy Decision
  → Next Question
```

## 验收条件

1. ✅ 使用一个固定的 AI / LLM Engineer Profile，包含一个 Project 和两个 Claim。
2. ✅ `POST /api/interviews/:id/start` 返回基于 Anchor Project 的第一问。
3. ✅ `POST /api/interviews/:id/answer` 永久保存原始回答和带 `sourceQuote` 的 Evidence。
4. ✅ Evidence 更新至少一个 Claim、Competency State 和 Evidence Gap。
5. ✅ Policy 返回 `CONTINUE_TOPIC` 或 `SWITCH_TOPIC`，并记录 Decision Trace。
6. ✅ 响应包含下一问；自动化测试覆盖完整两轮闭环。

当前 Evidence Extraction 是明确标注的中文关键词 Demo，不具备真实评估效力。它只用于验证状态流、评分、Policy、持久化和 UI；下一步由 Pi 结构化输出原位替换。

## 明确不做

- PDF / DOCX 简历解析
- RAG、Embedding、Vector Store
- 多岗位、多 Provider 配置界面
- 完整报告、雷达图、语音
- 独立的 Controller / Router / Skill 类层级

最后一项是有意限制：先用一个编排函数串起真实数据流。只有出现第二种实现或独立替换需求时，才提取接口或组件。

## Pi 接入门槛

Pi 适配层只有在闭环需要真实模型调用时进入 HTTP 主路径。首个接入只承担：

- Agent 消息与流式事件；
- 受控 Interview Tool 调用；
- 当前 Session 的对话历史。

Compaction 和动态 Skill Loading 等到长对话或第二个 Skill 出现后再做，不能拿框架能力列表代替产品闭环。
