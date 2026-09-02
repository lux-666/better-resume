# 简历理解

[返回架构 Map](../README.md)

| 项目 | 当前结论 |
| --- | --- |
| 当前判断 | 已有普通填写与可选 Resume/JD 上传入口，生产 Session 不再使用固定 Candidate Fixture |
| 已验证 | 普通表单支持多个 Project；文本/Markdown/文本型 PDF 可一次性解析并回填候选人与 JD 表单 |
| 主缺口 | 复杂简历的自动多 Project 分段准确率尚未建立基线 |
| 下一验收 | 单 Project、多 Project、模糊归属三份固定简历的预填结果可稳定人工修正 |

上传文件只用于客户端预填，不作为持久化数据。最终表单生成的 `candidate_input` Claim 初始必须为 `unverified`。

具体设计见[解析与 Candidate 构建契约](parsing-contract.md)。
