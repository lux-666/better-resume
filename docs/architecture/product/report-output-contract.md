# 候选人评估报告输出契约

[返回产品板块](README.md) · [返回架构 Map](../README.md)

## 输出对象

`GET /api/interviews/:id/report` 从已持久化的 `InterviewState` 生成：

```text
report      结构化 Candidate Report
markdown    同一份报告的人类可读渲染
```

接口不输出 System Scorecard。比赛评分由评委评价系统整体表现，不是产品报告内容。

## 综合判断

报告先提供招聘方可直接使用的 executive summary：

- 建议继续流程、定向核验、暂缓澄清或因证据不足暂不判断；
- 给出判断理由；
- 汇总已验证优势、风险与关注项；
- 列出每个证据缺口和下一步核验动作。

综合判断由 Report field 状态和 Evidence 确定，不额外调用模型生成无来源结论，也不输出候选人总分。

## 详细评估

每个 Project 输出四个当前通用调查维度：职责边界与交付、方法与决策、结果与验证、问题解决。非 missing 结论必须链接 Evidence，并进一步链接 Turn、Question 和候选人逐字 Answer Quote。

完整性检查覆盖：

- 非 missing Field 必须有 Evidence；
- Field 和 Evidence 必须双向引用；
- Evidence 必须引用存在的 Turn；
- `sourceQuote` 必须是该 Turn Answer 的原文子串；
- Evidence 与 Field 的 Project 必须一致；
- contradiction 的建立和解决 Evidence 必须存在。

## 客观边界

- Candidate Input Claim 只是待验证输入，不单独构成能力证据；
- missing 只表示没有足够信息，不表示候选人能力不足；
- 没有 JD 时不生成岗位匹配结论；
- 当前通用维度不冒充逐条 JD 要求验证；
- 招聘建议只覆盖本次面试证据，不包含背调或作品真实性核验。

## 导出

Web 提供 JSON 和 Markdown 下载。两种格式包含相同的综合判断、优势、关注项、证据缺口、招聘建议、项目详细评估、矛盾、评估依据、限制与完整性结果。
