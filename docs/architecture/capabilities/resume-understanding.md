# 简历理解

[返回能力建设 Map](README.md) · [领域模型](../domain/model.md)

## 目标

把候选人提供的简历转换为可审阅的 CandidateProfile，为面试建立 Project、Claim、Topic 和 EvidenceGap。转换结果是面试假设，不是已经验证的能力事实。

## 当前事实

- 创建 Session 只接收可选 `candidateName`；
- CandidateProfile 来自固定的企业 RAG Fixture；
- Fixture 包含 Ownership 与 15% Metric 两个 Resume Claim；
- 没有简历文本、文件上传、解析或人工确认入口；
- 没有教育、经历、项目和技能的通用映射；
- 没有根据 Role Pack 生成 Topic 与 Gap。

因此本方向尚未建设，当前 Demo 不能代表对真实简历的理解能力。

## 转换边界

```text
Resume text / file
  → text extraction
  → structured Candidate proposal
  → schema and provenance validation
  → candidate review / correction
  → canonical CandidateProfile
  → Role mapping
  → initial Topics and EvidenceGaps
```

每个 Resume Claim 保存原文来源和位置。解析器可以提出 Project、技术、结果和候选人角色，但不能把措辞升级成 Evidence。

同一个事实只进入 `candidate.projects` 一次。教育、经历和全局技能可以引用 Project 或 Claim，不能复制另一份会独立变化的 Project 状态。

## 最小输入范围

首个可用入口只需要支持可复制文本和文本型 PDF。OCR、复杂版式恢复、ATS 编辑器和简历导出不属于面试主链，在基础解析准确率有数据前不建设。

## 下一验收点

使用三份固定简历覆盖单项目、多项目和模糊归属，并满足：

- Project、时间、技术、结果和 Candidate Role 可人工校对；
- 每个 Claim 能追溯到简历原文；
- 所有 Resume Claim 初始为 `unverified`；
- Role Pack 能把 Project 映射到相关 Competency；
- 每个高价值 Claim 产生至少一个具体 EvidenceGap；
- 同一输入和 Parser 版本生成稳定结构；
- 解析失败时保留原文且不创建虚构事实。
