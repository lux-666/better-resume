# Evidence\-Driven Adaptive Interview Agent

## 基于 Pi Agent Runtime 的岗位胜任力多轮问询与评估系统技术设计文档

> Version: v0\.2
> Status: Draft
> Target: 科大讯飞 AI 开发者大赛 2026
> Primary Demo Role: AI / LLM 应用工程师
> Core Runtime: Pi Agent
> Core Design: Project\-aware \+ Evidence\-driven \+ Skill\-routed \+ Hierarchical Policy
> 
> 

---

# 项目概述

## 1\.1 项目目标

本项目面向新一代信息技术相关岗位，构建一个能够根据：

- 候选人简历；

- 目标岗位；

- 候选人真实项目经历；

- 当前面试上下文；

- 已获得能力证据；

- 尚未解决的能力疑点；

进行动态多轮问询的岗位胜任力评估智能体。

系统的目标并不是生成一套“看起来像面试题”的问题，而是：

> **持续寻找最能够降低关键岗位能力判断不确定性的新证据。**
> 
> 

系统最终输出：

- 岗位匹配度；

- 能力雷达图；

- Competency Score；

- Confidence；

- Supporting Evidence；

- Weak / Contradictory Evidence；

- 未充分验证能力；

- 核心优势；

- 风险与能力缺口；

- 改进建议；

- 可追溯 Decision Trace。

---

# 核心产品定位

传统 AI Interviewer 往往采用：

```Plain Text
Resume
  ↓
LLM
  ↓
Generate Question
  ↓
Candidate Answer
  ↓
LLM Score
```

这种方案存在几个问题：

1. 面试问题容易重复简历已有信息；

2. 缺乏清晰的追问目标；

3. 一个项目问几轮往往完全由模型随机决定；

4. 无法明确判断什么时候应该结束当前话题；

5. 项目、Topic 和岗位能力之间缺少显式关系；

6. 最终评分可能只是模型主观判断；

7. 长对话越来越依赖完整 Chat History；

8. 难以解释“为什么这一轮问这个问题”。

本项目采用：

```Plain Text
Resume
  ↓
Project Model
  ↓
Topic Thread
  ↓
Evidence Gap
  ↓
Hierarchical Policy
  ↓
Interview Skill
  ↓
Probe Strategy
  ↓
Natural Question
  ↓
Candidate Answer
  ↓
Evidence Update
  ↓
Competency Belief Update
  ↺
```

---

# 一句话技术定位

> **基于 Pi Agent Runtime 构建一个 Skill\-routed、Evidence\-driven、Project\-aware 的层级式自适应面试系统。**
> 
> 

---

# 设计原则

## 4\.1 Project\-first，而非 Question\-first

真实面试通常围绕：

- 项目；

- 工作经历；

- 技术决策；

- 实际问题；

- 结果；

展开。

因此本系统优先：

```Plain Text
Project
↓
Topic
↓
Evidence
```

而不是：

```Plain Text
Python
↓
RAG
↓
Agent
↓
数据库
```

---

# 4\.2 Resume Grounded

简历用于：

```Plain Text
建立事实背景
+
产生待验证 Claim
```

而不是生成重复问题。

例如简历写：

> 使用 Milvus \+ BGE \+ reranker 构建企业知识库。
> 
> 

低价值问题：

> 你是否使用过 reranker？
> 
> 

更合理：

> 当时是什么问题让你决定增加 reranker？
> 
> 

---

# 4\.3 Evidence Driven

候选人声明：

> “我很熟悉 RAG。”
> 
> 

不直接成为高分证据。

系统寻找：

- 技术选择依据；

- 实验过程；

- failure；

- trade\-off；

- ownership；

- evaluation；

- troubleshooting；

- 结果验证。

形成：

```Plain Text
Claim
↓
Probe
↓
Evidence
↓
Competency Belief
```

---

# 4\.4 LLM 不作为唯一 Controller

系统将能力分为四层：

```Plain Text
Pi Runtime
↓
Our Policy Engine
↓
Interview Skill
↓
LLM
```

其中：

### Pi Runtime

负责：

- Agent Session；

- Model Runtime；

- Message History；

- Tool 调用；

- Skill 加载；

- Extension 生命周期；

- Compaction。

### Our Policy Engine

负责：

- 当前 Topic 是否继续；

- 是否切换 Topic；

- 是否切换 Project；

- 是否进入 Scenario；

- 是否结束面试。

### Interview Skill

负责：

> 如何调查当前 Evidence Gap。
> 
> 

### LLM

负责：

- 理解自然语言；

- Evidence Extraction；

- Topic Discovery；

- 自然问题生成；

- Report Generation。

---

# 为什么使用 Pi Agent

本项目不再自行开发完整 Agent Runtime。

Pi Agent 主要承担：

```Plain Text
Agent Harness
```

解决：

- 模型调用；

- Session 生命周期；

- 上下文历史；

- Streaming；

- Compaction；

- Skills；

- Extensions；

- Custom Tools。

因此开发重点从：

```Plain Text
“怎么造一个 Agent 框架”
```

转移到：

```Plain Text
“怎么造一个好的 Interview Engine”
```

---

# Pi 与业务系统的职责边界

Pi 管理：

```Plain Text
Conversation Memory
Agent Session
Model Runtime
Skill Loading
Tool Runtime
Compaction
```

本项目管理：

```Plain Text
CandidateProfile
ProjectState
TopicThread
Claim
Evidence
CompetencyState
InterviewPolicy
DecisionTrace
```

必须严格区分：

> **Pi 知道“之前聊了什么”。**
> 
> 

和：

> **Interview Engine 知道“现在已经证明了什么”。**
> 
> 

两者不能混为一谈。

---

# 总体架构

```Plain Text
┌─────────────────────────────────────────┐
│                Frontend                 │
│                                         │
│ Resume / Interview / Assessment / Report│
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│          Application Backend            │
│           Node / TypeScript             │
│                                         │
│ Session API / DB / Role Registry        │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│             Pi Agent Runtime            │
│                                         │
│ AgentSession                            │
│ Model Runtime                           │
│ Skill Loader                            │
│ Extension Runtime                       │
│ Context / Compaction                    │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│          Interview Extensions           │
│                                         │
│ interview-state                         │
│ evidence-tools                          │
│ policy-engine                           │
│ rag-tools                               │
│ trace                                   │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│          Interview Skill Layer          │
│                                         │
│ ownership-grill                         │
│ metric-audit                            │
│ failure-forensics                       │
│ boundary-push                           │
│ decision-grill                          │
│ consistency-check                       │
│ architecture-grill                      │
│ domain skills                           │
└────────────────────┬────────────────────┘
                     │
                     ▼
             Natural Question
                     │
                     ▼
                  Candidate
                     │
                     ▼
              Evidence Update
                     │
                     └─────────────↺
```

---

# 推荐技术栈

## Frontend

```Plain Text
React
TypeScript
Vite
ECharts / Recharts
```

---

## Backend

```Plain Text
Node.js
TypeScript
```

---

## Agent Runtime

```Plain Text
Pi Agent SDK
```

---

## Database

MVP：

```Plain Text
SQLite
```

后续：

```Plain Text
PostgreSQL
```

---

## Vector Store

MVP：

```Plain Text
Chroma
或
Qdrant
```

如果希望减少组件：

```Plain Text
PostgreSQL + pgvector
```

也可作为后续方案。

---

## Embedding

```Plain Text
BGE 系列 Embedding
```

---

## LLM

通过统一 Provider 层接入：

```Plain Text
OpenAI compatible
Qwen
DeepSeek
Spark
Claude
...
```

---

# 岗位系统

第一版本采用：

```Plain Text
Role Registry
```

而不是允许完全任意岗位实时生成。

预计支持：

```Plain Text
AI / LLM 应用工程师
Java 后端开发工程师
AI 产品经理
```

重点打磨：

```Plain Text
AI / LLM 应用工程师
```

---

# Role Pack

每个岗位可以看作：

```Plain Text
Role Model
+
Competency Model
+
Rubric
+
Skill Pack
+
Knowledge Pack
+
Scenario Pack
```

目录：

```Plain Text
roles/
├── llm_engineer/
│   ├── role.yaml
│   ├── competency.yaml
│   ├── rubrics/
│   ├── knowledge/
│   ├── scenarios/
│   └── skills.yaml
│
├── java_engineer/
│
└── ai_product_manager/
```

---

# AI / LLM Engineer Competency Model

初始能力维度：

```YAML
role: llm_application_engineer

competencies:

  llm_fundamentals:
    weight: 0.12
    core: true

  rag_engineering:
    weight: 0.18
    core: true

  agent_engineering:
    weight: 0.15
    core: true

  software_engineering:
    weight: 0.15
    core: true

  evaluation:
    weight: 0.12
    core: true

  problem_solving:
    weight: 0.12
    core: true

  system_design:
    weight: 0.10

  communication:
    weight: 0.06
```

权重由 Role Pack 预设。

不允许模型在面试期间随意改变岗位权重。

---

# Rubric

每项 Competency 设置行为锚点。

例如：

```YAML
competency: rag_engineering

levels:

  basic:
    signals:
      - understands embedding
      - understands vector retrieval
      - understands retrieval-generation flow

  intermediate:
    signals:
      - can design chunk strategy
      - can configure retrieval
      - understands metadata filtering
      - has implementation experience

  advanced:
    signals:
      - retrieval evaluation
      - reranking
      - hybrid retrieval
      - failure analysis
      - latency-quality tradeoff

  expert:
    signals:
      - large scale retrieval architecture
      - systematic evaluation pipeline
      - advanced failure diagnosis
      - multi-stage retrieval optimization
```

Rubric 用于判断：

> 什么 Evidence 能支持什么能力等级。
> 
> 

不是固定题库。

---

# Interview Skill Layer

这是本项目的重要差异化模块。

Skill 表示：

> **一种可复用的专业调查策略。**
> 
> 

Policy Engine 先确定：

```Plain Text
当前缺什么证据
```

Skill 再决定：

```Plain Text
应该如何调查这个证据缺口
```

最后 LLM 决定：

```Plain Text
如何自然地问出来
```

---

# Skill 与 Probe 的区别

层级：

```Plain Text
Policy
↓
Skill
↓
Probe
↓
Question
```

### Skill

代表完整调查策略。

例如：

```Plain Text
metric-audit
```

### Probe

代表 Skill 内的一步原子动作。

例如：

```Plain Text
metric_definition
baseline_check
attribution_check
ablation_check
```

---

# Common Skill Pack

所有岗位均可复用。

```Plain Text
common/
├── ownership-grill/
├── metric-audit/
├── failure-forensics/
├── decision-grill/
├── boundary-push/
└── consistency-check/
```

---

# Ownership Grill

目标：

> 区分“团队做过”和“候选人本人做过”。
> 
> 

重点检查：

```Plain Text
implementation ownership
architecture ownership
decision ownership
experiment ownership
operation ownership
team boundary
```

典型问题：

```Plain Text
这部分当时是谁主要负责实现的？
```

或：

```Plain Text
这个方案你具体参与了哪部分？
```

---

# Metric Audit

专门验证：

```Plain Text
提升 20%
性能提高
准确率提升
成本下降
效率提高
```

等量化 Claim。

Skill 内部关注：

```Plain Text
Metric Definition
Dataset
Baseline
Sample Size
Measurement Process
Attribution
Ablation
Reproducibility
```

---

# Failure Forensics

通过真实 Failure 深挖：

```Plain Text
异常是什么？
↓
最初怀疑什么？
↓
怎么验证？
↓
怎么排除其他原因？
↓
根因是什么？
↓
怎么解决？
↓
如何防止再次发生？
```

可以同时获得：

```Plain Text
Troubleshooting
Technical Depth
Hypothesis Formation
Observability
Ownership
Engineering Maturity
```

等能力证据。

---

# Decision Grill

围绕：

```Plain Text
为什么这么选？
```

探索：

```Plain Text
Alternatives
Constraints
Trade-off
Decision Criteria
Result
```

例如：

> 为什么当时选择 Milvus？
> 
> 

如果候选人回答：

> 教程就是这么用的。
> 
> 

和：

> 当时比较了 Milvus、FAISS 和 pgvector……
> 
> 

提供的 Evidence 完全不同。

---

# Boundary Push

用于寻找能力上限。

逻辑：

```Plain Text
Can use
↓
Can explain
↓
Can evaluate
↓
Can diagnose
↓
Can redesign
↓
Can reason under new constraints
```

例如：

```Plain Text
你怎么使用 reranker？
```

之后可能升级：

```Plain Text
为什么需要 reranker？
```

再：

```Plain Text
怎么证明 reranker 真正带来了提升？
```

再：

```Plain Text
如果不允许使用 reranker，你会优先改哪里？
```

---

# Consistency Check

系统检测：

```Plain Text
Claim A
vs
Claim B
```

存在潜在冲突时，不立即判断候选人撒谎。

进入：

```Plain Text
Potential Contradiction
```

然后生成 Clarification。

例如：

前面：

> 整个架构是我设计的。
> 
> 

后面：

> 架构主要由 Tech Lead 负责。
> 
> 

系统问：

> 我确认一下，整体架构主要由负责人设计，你更多负责 retrieval 模块，对吗？
> 
> 

---

# Domain\-specific Skills

AI / LLM Engineer 可以增加：

```Plain Text
rag-grill
agent-grill
eval-grill
architecture-grill
llm-debugging
prompt-evaluation
```

Java Engineer：

```Plain Text
jvm-grill
database-grill
concurrency-grill
backend-architecture-grill
```

Product Manager：

```Plain Text
user-problem-grill
metric-grill
prioritization-grill
stakeholder-grill
product-tradeoff
```

---

# Skill 目录

```Plain Text
.agents/
└── skills/
    ├── ownership-grill/
    │   ├── SKILL.md
    │   └── references/
    │
    ├── metric-audit/
    │   ├── SKILL.md
    │   └── references/
    │
    ├── failure-forensics/
    │
    ├── boundary-push/
    │
    ├── consistency-check/
    │
    ├── rag-grill/
    │
    └── agent-grill/
```

---

# Skill 示例

```YAML
name: metric-audit

description:
  Verify quantitative outcome claims made by the candidate.

goal:
  Determine whether a claimed improvement is clearly defined,
  measured and attributable.

look_for:
  - metric_definition
  - baseline
  - evaluation_dataset
  - experiment_design
  - attribution
  - ablation

avoid:
  - assuming metrics existed
  - suggesting correct answers
  - accusing the candidate

stop_when:
  - metric is sufficiently defined
  - baseline is known
  - measurement method is understood
  - further probing has low expected information gain
```

---

# Pi Extensions

业务侧硬逻辑通过 Extensions 实现。

建议：

```Plain Text
extensions/
├── interview-state.ts
├── evidence-tools.ts
├── policy-engine.ts
├── rag-tools.ts
├── memory-tools.ts
└── decision-trace.ts
```

---

# interview\-state Extension

提供：

```Plain Text
get_candidate_profile
get_current_project
get_current_topic
get_competency_state
get_pending_topics
get_interview_progress
```

面试 Agent 主要读取，不允许直接任意修改 State。

---

# evidence\-tools Extension

工具：

```Plain Text
record_evidence
invalidate_evidence
register_claim
update_claim
flag_contradiction
register_topic_lead
```

所有写操作：

```Plain Text
必须通过 Schema 校验
```

---

# policy\-engine Extension

最重要工具：

```Plain Text
get_next_interview_action()
```

返回：

```JSON
{
  "action": "CONTINUE_TOPIC",

  "project_id": "project_1",

  "topic_id": "evaluation",

  "competency": "rag_engineering",

  "skill": "metric-audit",

  "target_gap": "metric_definition",

  "reason":
    "Candidate claimed a 15% accuracy improvement,
     but the metric remains undefined."
}
```

---

# RAG Extension

工具：

```Plain Text
retrieve_interview_knowledge
```

输入：

```Plain Text
role
competency
topic
skill
probe
candidate_level
```

而不是直接：

```Plain Text
candidate_answer
```

做无约束检索。

---

# Decision Trace Extension

每轮保存：

```Plain Text
State Before
Candidate Answer
Evidence Added
Claims Updated
Competency Update
Policy Action
Skill Selected
RAG Cards
Generated Question
```

用于：

- 调试；

- Demo；

- 解释；

- Evaluation。

---

# Candidate Profile

```TypeScript
interface CandidateProfile {
  id: string

  education: Education[]

  experiences: Experience[]

  projects: Project[]

  skills: string[]

  claims: Claim[]
}
```

---

# Project Model

```TypeScript
interface Project {
  id: string

  name: string

  description: string

  candidateRole?: string

  technologies: string[]

  outcomes: string[]

  claims: Claim[]

  mappedCompetencies: string[]

  topics: TopicThread[]

  status:
    | "unexplored"
    | "active"
    | "completed"
}
```

---

# Claim Model

```TypeScript
interface Claim {
  id: string

  source:
    | "resume"
    | "candidate_answer"

  text: string

  projectId?: string

  status:
    | "unverified"
    | "supported"
    | "weakened"
    | "contradicted"

  relatedCompetencies: string[]

  supportingEvidenceIds: string[]

  contradictingEvidenceIds: string[]
}
```

---

# Claim 示例

Resume：

> 负责企业 RAG 系统设计，回答准确率提高 15%。
> 
> 

拆成：

```Plain Text
Claim 1:
候选人负责系统设计

Claim 2:
系统结果提升15%

Claim 3:
候选人对该提升具有一定贡献
```

而不是将整句话作为一个不可分割事实。

---

# Topic Thread

```TypeScript
interface TopicThread {
  id: string

  projectId: string

  name: string

  status:
    | "candidate"
    | "active"
    | "paused"
    | "completed"

  summary: string

  evidenceIds: string[]

  unresolvedGaps: EvidenceGap[]

  pendingLeads: TopicLead[]

  relatedCompetencies: string[]

  turnIds: string[]

  saturation: number

  expectedInformationGain: number
}
```

---

# Topic Tree 示例

```Plain Text
企业知识库
│
├── Ownership
│
├── Retrieval
│   ├── Embedding
│   ├── Chunking
│   └── Reranker
│
├── Evaluation
│   ├── Dataset
│   ├── Metrics
│   └── Ablation
│
├── Engineering
│   ├── Deployment
│   ├── Latency
│   └── Monitoring
│
└── Troubleshooting
```

Topic 不要求开始前全部生成。

允许动态发现。

---

# Topic Discovery

候选人：

> reranker 上线之后 latency 从 400ms 变成了 900ms，后来换了更小的模型。
> 
> 

当前可能在：

```Plain Text
Reranker
```

系统产生：

```JSON
{
  "topic": "latency_optimization",

  "project_id": "project_rag",

  "importance": 0.84,

  "source_turn": 7
}
```

放入：

```Plain Text
PendingTopicQueue
```

不立即强制切换。

---

# Evidence Model

```TypeScript
interface Evidence {
  id: string

  turnId: string

  projectId?: string

  topicId?: string

  competencyId: string

  statement: string

  polarity:
    | "support"
    | "weakness"
    | "invalidate"

  strength: number

  specificity: number

  evaluatorConfidence: number

  sourceQuote: string
}
```

---

# Raw Turn

```TypeScript
interface InterviewTurn {
  id: string

  index: number

  projectId?: string

  topicId?: string

  question: string

  answer: string

  timestamp: string
}
```

Raw Turn 永久保留。

Summary 不替代原文。

---

# Evidence Extractor

Candidate Answer 之后，调用结构化 LLM。

输入：

```Plain Text
Current Question
Candidate Answer
Current Project
Current Topic
Relevant Claims
Recent Turns
Relevant Competency Rubric
```

输出：

```JSON
{
  "evidence": [],

  "new_claims": [],

  "resolved_gaps": [],

  "new_gaps": [],

  "new_topic_leads": [],

  "potential_contradictions": []
}
```

---

# Competency State

```TypeScript
interface CompetencyState {
  competencyId: string

  score?: number

  confidence: number

  evidenceIds: string[]

  missingEvidence: string[]

  contradictoryEvidence: string[]

  posterior?: {
    low: number
    medium: number
    high: number
  }
}
```

---

# MVP 评分

第一版本：

```Plain Text
Score
+
Confidence
```

例如：

```Plain Text
RAG Engineering

Score:
82

Confidence:
0.88
```

---

# 后续评分升级

可以升级为：

```Plain Text
P(low)
P(medium)
P(high)
```

再映射：

```Plain Text
Expected Competency Score
```

但不作为 MVP 必需项。

---

# 长期记忆架构

系统采用双层 Memory：

```Plain Text
Pi Conversation Memory
+
Structured Interview Memory
```

---

# Pi Conversation Memory

负责：

```Plain Text
Recent conversation
Message history
Natural context
Compaction
```

---

# Structured Interview Memory

负责：

```Plain Text
Topic
Project
Claim
Evidence
Competency
Decision
```

---

# Structured Memory 五级结构

```Plain Text
Level 1
Recent Turns

Level 2
Active Topic

Level 3
Current Project

Level 4
Competency State

Level 5
Global Interview State
```

---

# Active Topic Memory

例如：

```Plain Text
Topic:
RAG Evaluation

Known:
- 使用100条测试问题
- 使用 Recall@20
- reranker 后 top-3 命中率提升

Unknown:
- dataset construction
- ablation methodology
```

---

# Project Memory

```Plain Text
Project:
Enterprise RAG

Ownership:
Retrieval implementation

Validated:
- BGE
- Milvus
- reranker

Pending:
- deployment
- latency
```

---

# Global Interview State

```Plain Text
Turn:
9 / 12

Projects:
1 / 3 explored

Core Competencies:
4 / 6 sufficiently covered

Remaining:
Agent Engineering
System Design
```

---

# Interview Action

```TypeScript
enum InterviewAction {
  CONTINUE_TOPIC,
  SWITCH_TOPIC,
  SWITCH_PROJECT,
  SCENARIO_PROBE,
  CLARIFY_CONTRADICTION,
  GENERAL_PROBE,
  FINISH
}
```

---

# Hierarchical Policy

每轮决策：

```Plain Text
当前 Topic 是否仍有高价值 Evidence Gap？
              │
             YES
              ↓
       CONTINUE_TOPIC

              NO
              ↓

当前 Project 是否还有高价值 Topic？
              │
             YES
              ↓
         SWITCH_TOPIC

              NO
              ↓

其他 Project 是否能补关键能力？
              │
             YES
              ↓
        SWITCH_PROJECT

              NO
              ↓

仍有核心 Competency 缺口？
              │
             YES
              ↓
        SCENARIO_PROBE

              NO
              ↓
             FINISH
```

---

# Topic Utility

候选 Topic：

```Plain Text
TopicUtility
=
CompetencyImportance
× EvidenceGap
× ProjectRelevance
× ExpectedInformationGain
× ConversationalContinuity
-
RepetitionPenalty
-
FatiguePenalty
```

第一版采用 heuristic。

---

# Evidence Gap

```TypeScript
interface EvidenceGap {
  competencyId: string

  type: string

  description: string

  importance: number

  status:
    | "open"
    | "resolved"
    | "low_value"
}
```

---

# Topic Saturation

Topic 是否结束考虑：

```Plain Text
Confidence
Evidence Coverage
New Evidence Rate
Remaining Gap Importance
Turn Count
```

例如：

```TypeScript
if (
  confidence > 0.8 &&
  highValueGapCount === 0
) {
  completeTopic()
}
```

或：

```TypeScript
if (
  newEvidenceCountLastTwoTurns === 0
) {
  reduceTopicPriority()
}
```

---

# Topic Turn Limit

不固定：

```Plain Text
每 Topic 三问
```

推荐：

```Plain Text
minimum_topic_turns = 1

soft_max_topic_turns = 4

hard_max_topic_turns = 6
```

---

# Project Prioritization

ProjectValue：

```Plain Text
RoleRelevance
+
CoreCompetencyCoverage
+
ClaimDensity
+
EvidencePotential
```

示意权重：

```Plain Text
Role Relevance        40%
Competency Coverage   30%
Claim Density         20%
Project Richness      10%
```

---

# Anchor Project

最高价值 Project：

```Plain Text
Anchor Project
```

用于开始主要面试。

第一问通常偏：

```Plain Text
Ownership
```

或：

```Plain Text
Project Context
```

---

# Scenario Probe

仅在：

```Plain Text
Resume / Project 无法验证核心能力
```

时使用。

优先级：

```Plain Text
Project Evidence
>
Work Experience
>
Scenario
>
Generic Theory
```

---

# RAG 定位

本项目 RAG 不主要存：

```Plain Text
Python 教程
LLM 百科
RAG 教程
```

主要存：

```Plain Text
Competency Rubric
Behavior Anchor
Probe Strategy
Failure Pattern
Scenario
Interview Guidance
Evaluation Guidance
```

---

# Knowledge Card

```YAML
id: rag_eval_advanced

role:
  llm_engineer

competency:
  rag_engineering

topic:
  evaluation

level:
  advanced

signals:
  - distinguishes retrieval and generation evaluation
  - understands recall@k
  - performs ablation
  - constructs evaluation datasets

probe_directions:
  - metric definition
  - dataset construction
  - error attribution
  - ablation methodology
```

---

# RAG 调用顺序

错误：

```Plain Text
Candidate Answer
↓
Vector Search
↓
Question
```

正确：

```Plain Text
Candidate Answer
↓
Evidence Extraction
↓
Policy
↓
Skill
↓
Target Gap
↓
RAG
↓
Question Generator
```

---

# Question Generator

输入：

```Plain Text
Current Project
Current Topic
Recent Turns
InterviewDecision
Selected Skill
Selected Probe
Relevant Rubric
Relevant Evidence
Unresolved Gap
```

输出：

```Plain Text
One natural interview question
```

---

# Question Constraints

每轮必须遵守：

1. 一个主要问题；

2. 避免多问句；

3. 不重复简历事实；

4. 不暗示答案；

5. 不预设候选人做过某件事；

6. 不泄露 Rubric；

7. 与上一轮自然衔接；

8. 尽量简洁；

9. 不连续高压盘问；

10. 能允许候选人回答“不知道”或“没做过”。

---

# Decision Trace

```TypeScript
interface DecisionTrace {
  turnId: string

  stateBefore: object

  evidenceAdded: string[]

  claimUpdates: string[]

  competencyUpdates: object

  action: InterviewAction

  selectedSkill?: string

  selectedProbe?: string

  targetGap?: string

  reason: string

  retrievedCards: string[]

  generatedQuestion: string
}
```

---

# Decision Trace Demo

比赛界面可以展示：

```Plain Text
Candidate Answer
        ↓
New Evidence
        ↓
Competency Update
        ↓
Evidence Gap
        ↓
Policy Decision
        ↓
Skill Selected
        ↓
Next Question
```

例如：

```Plain Text
Evidence:
“候选人提到准确率提升15%”

Gap:
Metric definition unknown

Decision:
CONTINUE_TOPIC

Skill:
metric-audit

Probe:
metric-definition

Question:
“你刚才提到准确率提升15%，这里的准确率当时是怎么定义的？”
```

---

# 面试结束策略

推荐：

```Plain Text
minimum_turns = 8

soft_max_turns = 12

hard_max_turns = 15
```

结束条件：

```Plain Text
核心能力覆盖达到要求
+
关键 Competency Confidence 足够
+
不存在高优先级 Evidence Gap
```

---

# 强制结束

达到：

```Plain Text
hard_max_turns
```

直接：

```Plain Text
FINISH
```

剩余能力：

```Plain Text
Insufficient Evidence
```

而不是强行补分。

---

# Final Report

报告：

```Plain Text
Candidate Summary

Target Role

Overall Fit

Competency Radar

Competency Score

Competency Confidence

Supporting Evidence

Weak / Contradictory Evidence

Unverified Competency

Project Evaluation

Strengths

Risk

Development Suggestions
```

---

# Competency Detail

```Plain Text
RAG Engineering

Score:
84

Confidence:
89%

Supporting Evidence:
- 能解释引入 reranker 的原因
- 能区分 retrieval evaluation 与 generation evaluation
- 描述了实际 ablation

Missing Evidence:
- 未展示大规模 retrieval 系统经验

Assessment:
候选人具有较强的实际 RAG 工程能力。
```

---

# 前端设计

```Plain Text
┌───────────────────────────────────────────┐
│ Role / Candidate / Progress               │
├────────────────────┬──────────────────────┤
│                    │                      │
│ Interview Chat     │ Assessment Board     │
│                    │                      │
│                    │ Current Project      │
│                    │ Current Topic        │
│                    │ Selected Skill       │
│                    │ Evidence             │
│                    │ Competency State     │
│                    │ Pending Topics       │
│                    │                      │
├────────────────────┴──────────────────────┤
│ Final Report                              │
└───────────────────────────────────────────┘
```

---

# Assessment Board

Demo 版实时显示：

```Plain Text
Current Project
Enterprise RAG

Current Topic
Evaluation

Current Skill
Metric Audit

RAG Engineering
Score: 78
Confidence: 71%

Evidence
✓ 使用独立测试集
✓ 使用 Recall@20
? Ablation 未验证

Pending Topic
Latency Optimization
```

---

# Database

MVP 表：

```Plain Text
sessions

candidates

projects

claims

topics

turns

evidence

competency_states

decision_traces

reports
```

---

# API

```Plain Text
POST /api/interviews

POST /api/interviews/{id}/resume

POST /api/interviews/{id}/start

POST /api/interviews/{id}/answer

GET /api/interviews/{id}/state

GET /api/interviews/{id}/report

GET /api/interviews/{id}/trace

GET /api/roles
```

---

# 推荐目录

```Plain Text
project/
│
├── apps/
│   ├── web/
│   └── server/
│
├── packages/
│   ├── interview-core/
│   │   ├── models/
│   │   ├── policy/
│   │   ├── scoring/
│   │   └── memory/
│   │
│   ├── pi-runtime/
│   │   ├── extensions/
│   │   └── tools/
│   │
│   ├── rag/
│   │
│   └── shared/
│
├── roles/
│   ├── llm_engineer/
│   ├── java_engineer/
│   └── ai_product_manager/
│
├── .agents/
│   └── skills/
│
├── tests/
│
├── docs/
│
└── docker-compose.yml
```

---

# interview\-core

最核心且尽量与 Pi 解耦。

```Plain Text
packages/interview-core/
├── models/
│   ├── candidate.ts
│   ├── project.ts
│   ├── claim.ts
│   ├── topic.ts
│   ├── evidence.ts
│   ├── competency.ts
│   └── decision.ts
│
├── policy/
│   ├── topic-policy.ts
│   ├── project-policy.ts
│   └── stop-policy.ts
│
├── scoring/
│   └── competency-scoring.ts
│
└── memory/
    └── state-manager.ts
```

这样以后就算不用 Pi：

```Plain Text
Interview Core
```

也还能独立存在。

---

# Pi Runtime Layer

```Plain Text
packages/pi-runtime/
├── session.ts
├── context.ts
│
├── extensions/
│   ├── interview-state.ts
│   ├── evidence.ts
│   ├── policy.ts
│   ├── rag.ts
│   └── trace.ts
│
└── tools/
```

---

# Pi Tool 白名单

不要开放默认 Coding Agent 的：

```Plain Text
bash
write
edit
```

给面试 Agent。

只允许受控工具：

```Plain Text
get_interview_state
get_candidate_profile
get_project
get_topic
get_competency_state
retrieve_interview_knowledge
record_evidence
register_topic_lead
flag_contradiction
get_next_interview_action
save_decision_trace
```

---

# 安全边界

面试 Agent 不需要：

```Plain Text
任意 shell
任意 filesystem
任意 network
```

第三方 Skills / Extensions：

```Plain Text
必须人工审核
```

避免运行未经确认的任意代码。

---

# Model Provider

封装：

```TypeScript
interface ModelProvider {
  generate(...)
  generateStructured<T>(...)
}
```

Pi Runtime 之上的业务逻辑不应绑定单一模型。

---

# LLM 调用策略

理想：

```Plain Text
1~2 次调用 / Turn
```

例如：

### Call 1

```Plain Text
Evidence Extraction
+
Competency Evaluation
+
Topic Discovery
```

合并。

### Call 2

```Plain Text
Question Generation
```

---

# Prompt 模块

分开：

```Plain Text
resume_parser
evidence_extractor
competency_evaluator
question_generator
report_generator
```

不要使用：

```Plain Text
一个万能 Interview Prompt
```

---

# Structured Output

强制结构化：

```Plain Text
Resume Parser
→ Schema

Evidence Extractor
→ Schema

Evaluator
→ Schema

Policy
→ Deterministic Code

Question
→ Text

Report
→ Structured JSON + Markdown
```

---

# Evaluation Framework

不仅评估 Candidate。

还要评估：

```Plain Text
Interview Agent 本身
```

---

# Candidate Persona Test

构造：

```Plain Text
Strong Candidate
Medium Candidate
Weak Candidate
Inflated Resume Candidate
Inconsistent Candidate
Verbose-but-Shallow Candidate
Short-but-Strong Candidate
```

---

# Interview Quality Metrics

可以衡量：

```Plain Text
Context Awareness
Non-Repetition
Question Necessity
Groundedness
Information Gain
Topic Transition Quality
Evidence Coverage
Competency Coverage
```

---

# New Evidence Rate

```Plain Text
New Evidence Rate
=
Questions producing useful new evidence
/
Total questions
```

目标：

```Plain Text
Adaptive Interview
>
Static Interview
```

---

# Ablation Study

至少比较：

```Plain Text
A. Static Question List

B. Resume-aware LLM Interview

C. Evidence-driven Adaptive Interview

D. Skill-routed Evidence-driven Interview
```

比较：

```Plain Text
Evidence Coverage
Question Repetition
Core Competency Coverage
Report Confidence
Average New Evidence Rate
```

---

# Memory Evaluation

测试：

Turn 2：

> latency = 400ms
> 
> 

Turn 10：

再次讨论 latency。

观察：

```Plain Text
是否正确记住？
是否篡改数值？
是否产生矛盾？
```

---

# Contradiction Test

Turn 3：

> 我负责整体架构。
> 
> 

Turn 8：

> 架构由 Tech Lead 负责。
> 
> 

预期：

```Plain Text
Potential Contradiction
↓
Consistency Check Skill
↓
Clarification
```

---

# Policy Unit Test

```TypeScript
test_continue_topic_when_high_value_gap_exists()

test_switch_topic_when_current_topic_saturated()

test_switch_project_for_missing_core_competency()

test_use_scenario_when_resume_has_no_evidence()

test_finish_when_core_coverage_sufficient()

test_force_finish_at_hard_limit()
```

---

# Skill Evaluation

每个 Skill 单独测试。

例如：

```Plain Text
metric-audit
```

输入：

> 提升准确率20%
> 
> 

检查是否优先调查：

```Plain Text
metric definition
baseline
measurement
attribution
```

而不是突然去问：

```Plain Text
Python coding
```

---

# MVP 范围

第一版必须完成：

```Plain Text
Resume Parsing
Role Selection
Project Extraction
Claim Extraction
Anchor Project Selection
Multi-turn Interview
Topic Thread
Evidence Extraction
Competency State
Hierarchical Policy
Skill Routing
RAG
Topic Switching
Project Switching
Final Report
```

---

# 第一版暂缓

不要优先做：

```Plain Text
语音
高并发
企业账号系统
复杂权限
Kubernetes
多 Agent Supervisor
强化学习
知识图谱
大规模题库
自动招聘决策
```

---

# 开发阶段 1：Interview Core

优先写：

```Plain Text
Project
Claim
TopicThread
Evidence
CompetencyState
InterviewState
InterviewDecision
DecisionTrace
```

---

# 开发阶段 2：Pi Runtime

实现：

```Plain Text
Pi Session
Custom Tools
Extensions
Skill Loading
```

先只注册最少工具。

---

# 开发阶段 3：最小 Interview Loop

实现：

```Plain Text
Answer
↓
Evidence Extractor
↓
State Update
↓
Policy
↓
Skill
↓
Question
```

先不做漂亮 UI。

---

# 开发阶段 4：Topic / Project Hierarchy

实现：

```Plain Text
CONTINUE_TOPIC
SWITCH_TOPIC
SWITCH_PROJECT
FINISH
```

---

# 开发阶段 5：Skill Pack

优先：

```Plain Text
ownership-grill
metric-audit
failure-forensics
boundary-push
consistency-check
```

---

# 开发阶段 6：RAG

构建 AI / LLM Engineer：

```Plain Text
Rubric Cards
Probe Cards
Failure Cards
Scenario Cards
```

不追求大数据量。

---

# 开发阶段 7：Report \+ UI

加入：

```Plain Text
Radar
Confidence
Evidence
Project Map
Topic
Selected Skill
Decision Trace
```

---

# 开发阶段 8：额外岗位

最后再增加：

```Plain Text
Java
AI Product Manager
```

主要用于展示：

> 系统具有 Role Pack 扩展能力。
> 
> 

不要求与 LLM Engineer 同等深度。

---

# Demo 简历设计

项目一：

```Plain Text
Enterprise RAG Knowledge Base
```

包含：

```Plain Text
BGE
Milvus
Reranker
15% improvement
Latency issue
```

项目二：

```Plain Text
Multi-Agent Research Platform
```

包含：

```Plain Text
Agent
Tool Calling
State
Workflow
Evaluation
```

---

# Demo 路径

```Plain Text
RAG Project
↓
Ownership Grill
↓
Retrieval
↓
Candidate mentions reranker
↓
Decision Grill
↓
Candidate claims +15%
↓
Metric Audit
↓
Evaluation Topic
↓
Candidate mentions latency
↓
Pending Topic Created
↓
Evaluation Saturated
↓
Switch Topic
↓
Failure / Latency
↓
Project Saturated
↓
Switch Project
↓
Agent Project
↓
Boundary Push
↓
Finish
```

---

# 核心差异化

本项目不应宣传：

> “我们用了 Agent。”
> 
> 

也不应宣传：

> “我们用了 RAG。”
> 
> 

更不应宣传：

> “我们用了长记忆。”
> 
> 

这些都非常同质化。

真正差异是：

### Project\-aware

以项目为真实面试主线。

### Claim Verification

简历声明被视为待验证 Claim。

### Topic Thread

一个项目存在多个可持续探索的 Topic。

### Evidence\-driven

所有能力判断以 Evidence 为核心。

### Hierarchical Policy

```Plain Text
Topic
↓
Project
↓
Competency
↓
Interview
```

逐级判断。

### Skill\-routed Interview

不同 Evidence Gap 选择不同 Interview Skill。

### Dynamic Topic Discovery

回答可以产生新的调查方向。

### Contradiction\-aware

后续证据可以削弱之前判断。

### Score \+ Confidence

区分能力与证据充分度。

### Explainable Decision Trace

每轮可以解释：

> 为什么问。
> 
> 

---

# 与普通 AI Interviewer 的区别

普通：

```Plain Text
Resume
↓
LLM
↓
Question
↓
Score
```

本项目：

```Plain Text
Resume
↓
Project
↓
Claim
↓
Topic
↓
Evidence Gap
↓
Policy
↓
Interview Skill
↓
Probe
↓
Question
↓
Evidence
↓
Competency State
↓
Next Decision
```

---

# 最大技术风险

## Risk 1：Pi Runtime 与业务过度耦合

解决：

```Plain Text
Interview Core 与 Pi Runtime 分包
```

---

## Risk 2：LLM Evidence Evaluation 漂移

解决：

```Plain Text
Rubric
Structured Output
Source Quote
Evidence Trace
Consistency Tests
```

---

## Risk 3：Skill 数量过多

解决：

MVP 只实现：

```Plain Text
5 个 Common Skills
+
2~3 个 LLM Engineer Skills
```

---

## Risk 4：Policy 太复杂

第一版用启发式。

不要训练 RL Policy。

---

## Risk 5：面试看起来像审讯

Skill 必须限制：

```Plain Text
连续追问数
语气
强度
自然切换
```

---

## Risk 6：RAG 成为装饰

RAG 必须绑定：

```Plain Text
Rubric / Skill / Gap
```

而不是无目的 Retrieval。

---

# 核心技术主线

```Plain Text
Resume
↓
Candidate Profile
↓
Project Extraction
↓
Claim Extraction
↓
Anchor Project
↓
Topic Thread
↓
Candidate Answer
↓
Evidence Extraction
↓
Competency Update
↓
Evidence Gap
↓
Hierarchical Policy
↓
Interview Skill Routing
↓
RAG
↓
Probe
↓
Natural Question
↓
Candidate Answer
↺
↓
Evidence-backed Report
```

---

# 系统核心职责划分

最终必须坚持：

```Plain Text
Pi
=
Agent Runtime

Policy
=
决定调查什么

Skill
=
决定怎么调查

RAG
=
提供专业依据

LLM
=
理解 + 自然表达

Evidence Store
=
保存判断依据

Competency State
=
保存当前 belief

Decision Trace
=
保存为什么这么做
```

---

# 最重要的设计原则

> **系统每轮的目标不是生成一个“像面试题”的问题，而是在保持对话自然连续的前提下，选择最有可能获得关键新证据的问题。**
> 
> 

---

# 项目核心表达

最终对评委可以概括：

> 本项目基于 Pi Agent 构建面试运行时，在其 Agent Session、Skills 和 Extensions 能力之上，自研 Project\-aware Interview State、Evidence Model、Hierarchical Policy 和 Interview Skill Pack。
> 
> 系统从候选人真实项目经历出发，将简历描述转化为待验证 Claim，并通过 Ownership、Metric Audit、Failure Forensics、Boundary Push 等可组合 Interview Skills 动态寻找候选人的真实能力边界。
> 
> 每轮问询都会更新 Topic、Evidence 和 Competency State，并由确定性的层级 Policy 判断继续当前 Topic、切换 Topic、切换 Project 或结束面试，最终生成具有 Evidence 与 Confidence 支撑的岗位胜任力报告。
> 
> 

---

# MVP 是否成功的判断标准

项目第一版只要能够稳定实现下面这条链，就已经成立：

```Plain Text
同一个 Project
↓
发现多个 Topic
↓
选择一个 Topic
↓
连续追问几轮
↓
不断获得 Evidence
↓
发现新 Topic
↓
判断当前 Topic 已 Saturated
↓
自然切换 Topic
↓
必要时切换 Project
↓
最终能力判断可追溯到原始 Evidence
```

如果这一闭环做扎实，本项目就已经明显区别于：

```Plain Text
Resume + Prompt + Chatbot + Radar Chart
```

这一类高度同质化作品。

