# Task 3.2：报告叙述 Agent

[返回 Phase 3](README.md)

**实现状态：Implemented。叙述失败隔离、重试、版本 fencing 与事实报告回退已覆盖。**

## 目标

在确定性报告数据之上增加一层模型生成的叙述，让招聘方不需要理解 Evidence ID 也能读懂结论，同时保持每句判断可回溯到候选人原话。

## 分层

```text
Layer 0  InterviewState                       权威事实
Layer 1  CandidateReportArtifact              确定性派生：计数、状态、深度层级、Lead、矛盾、完整性
Layer 2  ReportNarrative                      模型生成：叙述文本，每句带 Evidence 引用
Layer 3  Markdown / 页面渲染                   Layer 1 + Layer 2 的展示
```

Layer 2 不能修改 Layer 1 的任何状态或数字。叙述与数据不一致时以数据为准，校验器拒绝叙述。

## 叙述结构

```ts
interface ReportNarrative {
  schemaVersion: "report-narrative-v0.1";
  overall: NarrativeParagraph;                    // 综合判断，2–4 句
  competencies: Array<{
    competencyId: string;
    verdict: "demonstrated" | "partially_demonstrated" | "not_demonstrated" | "conflicting";
    boundary: NarrativeParagraph;                 // 能力边界：到达哪一层、停在哪一层
    highlights: NarrativeSentence[];
  }>;
  projects: Array<{ projectId: string; summary: NarrativeParagraph }>;
  recruiterNextSteps: NarrativeSentence[];       // 面试官可直接使用的下一轮问题
  candidateFeedback: NarrativeSentence[];        // 给候选人：哪些经历缺少可验证细节
  unexploredLeads: string[];                     // 来自 dropped Lead，只列不评价
}

interface NarrativeSentence { text: string; evidenceIds: string[]; }
type NarrativeParagraph = NarrativeSentence[];
```

## 校验器

`validateNarrative(narrative, artifact)` 是确定性函数，拒绝以下任何一条：

- 引用的 `evidenceIds` 在 artifact 中不存在；
- 任一句子 `evidenceIds` 为空，除 `unexploredLeads` 与结构性过渡句外；
- 句子里出现数字，而该数字不在所引用 Evidence 的 `sourceQuote` 或 `statement` 中，也不是 Layer 1 的计数；
- `verdict` 与 Layer 1 状态冲突：字段全部 missing 却写 demonstrated，或存在 open contradiction 却不写 conflicting；
- 出现录用、淘汰、薪资、等级等超出报告口径的词；
- 出现 rubric、评分、得分等内部术语。

校验失败重试一次，仍失败则报告只输出 Layer 1，并在 `limitations` 写明“叙述层生成失败”。不静默降级。

## 字段结论聚合

修复 `ReportField.summary` 只保留最后一条 Evidence 的问题：`summary` 改为由全部 Evidence 派生的结构：

```ts
interface FieldConclusion {
  supportStatements: string[];
  weaknessStatements: string[];
  invalidateStatements: string[];
  reachedDepth?: number;
  boundaryReason?: { depthLevel: number; sourceQuote: string };
}
```

新旧 Session 都按已有 Evidence 的 polarity 重建结论；不能把旧 summary 一律当作支持性事实。历史 Evidence 缺少 depthLevel 时保留未知，不推测深度。

## 能力项利用

`CompetencyState.score` 与 `confidence` 进入报告 Layer 1，但只作为“证据强度指数”，明确标注不是能力总分。报告对每个 core competency 输出：状态分布、证据强度指数、到达深度、边界说明。综合建议四态口径不变。

## 页面内报告

- 面试进行中，右栏增加“报告预览”Tab，展示 Layer 1 与已生成的 Layer 2；每轮回答后刷新；
- 面试完成后主区切换为完整报告视图，下载按钮保留；
- 叙述生成使用独立 Narrative Trace，绑定来源 State 版本；失败明确显示并可恢复，不能阻塞下一问。
- 叙述生成在 `finish_interview` 被接受后异步执行，页面轮询 `GET /api/interviews/:id/report`，`narrativeStatus: "pending" | "ready" | "failed"`；
- 面试进行中的叙述预览只在候选人不可见的审核模式下展示，避免候选人受结论影响。Pilot 模式已有锁定机制，复用。

## 双边建议

`recruiterNextSteps` 面向招聘方，每条是一个可以直接问的问题，标注针对哪个字段与目标层级。`candidateFeedback` 面向候选人，只指出“哪段经历缺少什么类型的可验证细节”，不评价能力高低。两者共用同一 Evidence 引用约束。

## 模型分工

叙述 Agent 使用 `LLM_REPORT_MODEL`，一次调用，工具为 `read_report_artifact` 与 `submit_narrative`。输入为 Layer 1 全量与全部 Evidence 的 statement、sourceQuote、depthLevel；不输入对话全文。

## 验收

- 三个发布场景与七个固定 Profile 的叙述全部通过校验器；
- 篡改 Evidence 引用后校验器必然拒绝；
- 人工 Rubric “报告客观、维度全面、建议可执行”三项不低于 Phase 2 人工评审，且“可读性”新增一项达到基线；
- 页面内报告与下载 JSON 的 Layer 1 逐字节一致；
- 叙述失败时 API 与页面均明示，报告仍可下载。
