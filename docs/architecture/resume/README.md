# 简历理解

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | 只有固定 Fixture，没有真实 Resume 输入路径 |
| 已验证 | 企业 RAG 与客服 Agent 双 Project Fixture 可生成初始 Candidate Report |
| 主缺口 | 没有简历输入、解析、来源定位或候选人确认入口 |
| 下一验收 | 一份真实简历稳定生成可审阅的 Project、Claim 和初始 Report field |

Resume Parser 只创建待验证假设；Resume Claim 初始必须为 `unverified`。

具体设计见[解析与 Candidate 构建契约](parsing-contract.md)。
