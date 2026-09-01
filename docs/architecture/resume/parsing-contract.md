# 解析与 Candidate 构建契约

[返回简历板块](README.md) · [返回架构 Map](../README.md) · [领域模型](../competency/model-and-evidence.md)

## 目标

把候选人提供的简历转换为可审阅的 CandidateProfile、Project、Claim 和初始 Candidate Report。解析结果是待调查假设，不是能力 Evidence。

## 当前事实

- 创建 Session 只接收可选 `candidateName`；
- CandidateProfile 来自固定双 Project Fixture；
- Fixture 包含四个 Ownership/Metric Resume Claim；
- Core 为每个 Project 初始化 Ownership、Mechanism、Measurement、Failure 四个 Report field；
- 没有简历文本、文件上传、解析或人工确认入口。

## 目标转换

```text
Resume text / file
  → text extraction
  → Candidate proposal with provenance
  → schema validation and candidate correction
  → canonical CandidateProfile
  → Role mapping
  → initial Candidate Report fields
```

首个入口只支持可复制文本和文本型 PDF。OCR、复杂版式恢复和简历编辑器在基础解析准确率有数据前不建设。

## 验收

- Project、时间、技术、结果和 Candidate Role 可人工校对；
- 每个 Claim 能追溯到简历原文且初始为 `unverified`；
- Role Pack 能把 Project 映射到相关 Competency；
- 初始 Report field 描述具体、可调查、无能力结论；
- 同一输入和 Parser 版本生成稳定结构；
- 解析失败时保留原文且不创建虚构事实。
