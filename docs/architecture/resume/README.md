# 简历理解

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | 已有普通填写与可选 Resume/JD 上传入口，生产 Session 不再使用固定 Candidate Fixture |
| 已验证 | 普通表单支持多个 Project；文本/Markdown/文本型 PDF/JPG/PNG/WebP 可一次性提取并回填候选人与 JD 表单 |
| 主缺口 | 复杂简历的自动多 Project 分段准确率尚未建立基线 |
| 下一验收 | 单 Project、多 Project、模糊归属三份固定简历的预填结果可稳定人工修正 |

原始上传文件不持久化；JD 提取全文发送给现有文本 LLM 填写四项表单，不保存提取全文，由用户校对。简历仍在客户端预填，全文仅在用户勾选后上传用于索引。最终表单生成的 `candidate_input` Claim 初始必须为 `unverified`。

具体设计见[解析与 Candidate 构建契约](parsing-contract.md)。
