# 面试官知识卡片（20 题试用）

首批来自 [xyma2003/interview-bagu 的 AI Agent 题库](https://github.com/xyma2003/interview-bagu/blob/06a0473e5520eba7dcb75d6f417b9f715582fca6/ai-agent/ai_agent.md)，固定提交 `06a0473e5520eba7dcb75d6f417b9f715582fca6`，范围为 Q1–Q20。

每张卡围绕一个核验焦点，正文约 100–300 字，包含适用场景、核验重点、可追问方向、浅层信号和避免预设。正文明确标注“本项目整理（非上游原文）”。上游原题、考察点与来源完整保留在 frontmatter，作为原始素材，不充当标准答案，也不能证明候选人拥有某项能力。卡片文件随 GitHub 项目分发，运行时无需抓取上游。

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
sourceTitle: "上游题目编号或标题"
originalQuestion: "原题完整题干"
sourceFocus: "原始考察点"
---

# 一个具体核验焦点

本项目整理（非上游原文）

适用场景：候选人刚提到了什么。
核验重点：区分两个容易混淆的机制或决策。
可追问方向：先核验一个实际细节，再按回答选择下一步。
浅层信号：哪种笼统回答值得继续核验。
避免预设：不假定候选人做过哪些事或某方案必然更优。
```

`id` 在修改正文或移动文件时保持稳定。`fieldKinds` 对应现有字段后缀：`ownership`、`mechanism`、`measurement`、`failure`。`depthLevels` 表示可用于提问的深度，而非题目已经证明候选人达到了该深度。普通 README 没有 frontmatter，不参与索引。

## 索引内容与来源边界

embedding 输入依次组合 `domains`、`fieldKinds`、`originalQuestion`、`sourceFocus` 和完整核验正文（含标题）。`id`、来源 URL/commit、路径、hash、上游评价性解析不参与向量生成。卡片仍是一张一个 chunk，返回的 `text` 是精炼核验正文，`source` 另存并返回原题、考察点和版本；技术视图中可分别展开。

SQLite 的 `content_hash` 记录完整文件变化；`embedding_hash` 记录实际语义输入变化。只更改 URL、commit 或深度过滤元数据时更新数据库而不重新 embedding；更改正文、原题、考察点、领域或字段类型时重建该卡向量。删除卡片同步清理，更换 embedding URL/模型重建全量向量。旧索引启动时自动补列，首次升级按新输入生成向量，已有 Session 不受影响。

## 先少量试用，再按漏问补卡

```bash
npm run eval:knowledge -- --smoke
npm run eval:knowledge:questions -- --smoke
```

第一条仅检查 RAG、幂等恢复、提示缓存三条查询；第二条仅生成幂等场景的一组有/无检索问题对。分别输出到 `data/evaluations/phase4-knowledge-smoke.json` 和 `phase4-knowledge-questions-smoke.json`。冒烟检查记录命中与问题供人查看，不以小样本分数作为质量 Gate；网络/索引/模型错误仍会报错。

当前优先经历几轮实际对话：看是否命中正确焦点、追问有没有贴合刚说的细节、是否带入候选人未说过的假设，然后修改相关卡片。浅层信号只能触发核验，不能直接触发负面结论。不先扩大题库或做完 100 条标注。

去掉 `--smoke` 仍可运行原有 20 条查询和 3 组问题对，留作需要时的复查工具。9 月 5 日的分数只对应改写前卡片，不代表当前卡片质量，也不应据此宣布追问能力提升。
