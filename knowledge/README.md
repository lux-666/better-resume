# 面试官知识卡片（20 题试用）

首批来自 [xyma2003/interview-bagu 的 AI Agent 题库](https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md)，固定提交 `06a0473e5520eba7dcb75d6f417b9f715582fca6`，范围为 Q1–Q20。

每张保留上游题干和考察点，部分补充上游题目解析；元数据分类为本项目整理。它们用于帮助面试官选择核验方向，不是标准答案，也不能证明候选人拥有某项能力。卡片文件随 GitHub 项目分发，运行时无需抓取上游。

## 卡片约定

一题一 Markdown，首部是逐行 JSON 值形式的 frontmatter：

```markdown
---
id: "stable-card-id"
kind: "competency"
domains: ["ai_engineering", "rag"]
fieldKinds: ["mechanism", "ownership", "measurement"]
depthLevels: [1, 2, 3, 4, 5]
sourceUrl: "https://example.com/source"
sourceCommit: "pinned-commit"
sourceTitle: "原题标题"
---

# 原题题干

源题考察点：……
```

`id` 在修改正文或移动文件时保持稳定。`fieldKinds` 对应现有字段后缀：`ownership`、`mechanism`、`measurement`、`failure`。`depthLevels` 表示可用于提问的深度，而非题目已经证明候选人达到了该深度。普通 README 没有 frontmatter，不参与索引。

重启时按正文和元数据哈希检查更新。新增/修改只嵌入变更卡片，删除会从 SQLite 清除，切换 embedding URL 或模型会重建全部向量。索引失败时保留上一份完整磁盘快照，但本次运行明确退回静态策略；不会继续使用不匹配的旧模型向量。

```bash
npm run eval:knowledge
npm run eval:knowledge:questions
```

第一条生成真实 embedding 索引并测试 20 条冻结改写查询；第二条对 3 个合成 frozen State 生成有/无检索的问题对，供人工评分。结果在 `data/evaluations/`。两者都使用用户配置的模型 API，问题对脚本还调用 Interview 模型。扩展前先验证新增题目来源，再增加独立查询标注，不以题干自身检索命中作为效果结论。
