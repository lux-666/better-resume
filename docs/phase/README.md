# 产品交付 Phases

总目标：把当前“架构与工具契约可运行”的 Demo，推进为“真实模型行为可验证、真实简历能产出可信 Candidate Report”的最小产品闭环，再进一步成为能识别候选人能力边界、报告可读可执行、面试体验专业自然的评估产品。

| Phase | 状态 | 目标 |
| --- | --- | --- |
| [Phase 1](phase1/README.md) | Completed | 建立真实模型评测与失败驱动优化闭环 |
| [Phase 1.5](phase1.5/README.md) | In progress | 已实现 Trace、Evaluation 和获准上线的模型分工，真实基线继续积累 |
| [Phase 2](phase2/README.md) | Completed | 真实输入、上下文解耦、候选人评估报告和真实模型发布 Gate 已完成 |
| [Phase 3](phase3/README.md) | Planned | 能力深度探测、报告叙述、面试官拟人化与路演就绪 |
| [Phase 4](phase4/README.md) | In progress：4.1 的 20 题试用 | 面试官知识 RAG、长文本记忆、JD 逐条映射与产品化 |

Phase 2 已形成可发布的本地 Demo 闭环。技术能力只按真实运行链路记录，不为评分虚报 RAG 或长期记忆；Phase 4 交付真实的检索与记忆链路后，文档才允许声称这两项能力。

## 评审标准映射

作品方案评审与路演评审的每一项都必须能指向已交付或已规划的 Task，而不是口头承诺。

| 评审项 | 权重 | 主要支撑 Task |
| --- | ---: | --- |
| 面试逻辑深度 | 30 | [3.1 深度梯与线索记忆](phase3/task-3.1-depth-and-leads.md)、[4.1 面试官知识 RAG](phase4/task-4.1-interviewer-knowledge-rag.md)、[4.3 Role Pack 与简历全文](phase4/task-4.3-role-pack-and-resume.md) |
| 评估报告质量 | 30 | [3.2 报告叙述 Agent](phase3/task-3.2-report-narrative.md)、4.3 岗位要求匹配矩阵 |
| 智能体拟人度 | 20 | [3.3 面试官人设与交互](phase3/task-3.3-interviewer-persona.md) |
| 技术实现 | 20 | 4.1、[4.2 长文本记忆](phase4/task-4.2-long-context-memory.md)、已有 Phase 1.5 Trace 与模型分工 |
| 路演功能实现 | 40 | [3.4 路演就绪](phase3/task-3.4-demo-readiness.md)、3.2 页面内报告 |
| 路演技术水平 | 30 | 4.1、4.2、Phase 1.5 可观测性 |
| 市场接受度 | 10 | 3.2 双边建议、4.3 Role Pack |
