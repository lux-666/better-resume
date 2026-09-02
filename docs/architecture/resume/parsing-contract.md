# 解析与 Candidate 构建契约

[返回简历板块](README.md) · [返回架构 Map](../README.md) · [领域模型](../competency/model-and-evidence.md)

## 目标

把候选人提供的简历转换为可审阅的 CandidateProfile、Project、Claim 和初始 Candidate Report。解析结果是待调查假设，不是能力 Evidence。

## 当前事实

- 创建 Session 只接收结构化 Candidate 与可选结构化 Job；
- Candidate Intake 只包含姓名、技能和至少一个 Project；每个 Project 只要求名称与一段项目经历；
- Job 作为整体可选，提供时必须同时包含岗位、岗位介绍、职责和要求；
- Web 支持 TXT、Markdown、JSON、CSV 和文本型 PDF；文件只在浏览器内一次性解析并回填表单，扫描版不做 OCR；
- Server 不接收文件、文件名或原始 Resume/JD 文本；
- 每段项目经历整体生成一条 `candidate_input` Claim，保存该段原文作为 `sourceQuote`，初始为 `unverified`，不能作为 Evidence 或能力结论；
- Core 为每个 Project 初始化个人贡献、方法与决策、结果与验证、问题解决四个跨岗位通用 Report field；
- 面试前人工确认/修正已实现；复杂版式下的多 Project 自动分段尚未建立准确率基线。

## 目标转换

```text
Resume / JD file
  → text extraction
  → editable Candidate/Job form prefill
  → user correction
  → discard raw extracted text
  → schema validation
  → canonical CandidateProfile
  → Role mapping
  → initial Candidate Report fields
```

首个入口支持普通填写、文本文件和文本型 PDF。OCR、复杂版式恢复和通用简历编辑器在基础解析准确率有数据前不建设。

## Job Description 边界

生产链路不再读取固定 `roles/llm_engineer/role.json`。每个 Session 保存自己的 `InterviewRole`：

- 有结构化 Job：Role ID 由岗位、介绍、职责和要求稳定生成；
- 没有 Job：使用 `general_candidate` 通用 Role；
- Interview Agent Context 显式包含当前 Role；Report Agent 只读取紧凑岗位要求；
- Core completion 和 UI Competency 进度读取 `state.role.competencies`，不读取进程级全局岗位。

Role 当前只解耦岗位输入和 Competency 上下文，尚未完成 required/optional Report field 的 Role Pack contract。

## 验收

- 用户只需校对姓名、技能、项目名称和项目经历；
- 每条项目经历 Claim 能追溯到对应项目经历原句且初始为 `unverified`；
- Role Pack 能把 Project 映射到相关 Competency；
- 初始 Report field 描述具体、可调查、无能力结论；
- 同一输入和 Parser 版本生成稳定结构；
- 上传解析失败时不回填虚构事实。
