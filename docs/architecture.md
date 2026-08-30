# Better Resume System Architecture

> This document is the authoritative description of the system structure and runtime contracts.

## 1. Purpose

Better Resume is an evidence-driven adaptive interview system. Its output is not a transcript-shaped impression; it is a competency assessment whose claims can be traced to the candidate's original words.

The governing loop is:

```text
Resume Claim
  → Evidence Gap
  → Policy Decision
  → Skill / Probe
  → Question
  → Raw Answer
  → Structured Evidence
  → Claim / Competency / Gap Update
  → Next Policy Decision
```

The LLM handles language. Deterministic application code owns state, scoring, routing, stopping, and persistence.

## 2. System Context

```text
┌──────────────┐       HTTP        ┌──────────────────┐
│ Candidate UI │ ────────────────► │ Application API  │
│ React / Vite │ ◄──────────────── │ Node / TypeScript│
└──────────────┘                   └────────┬─────────┘
                                           │
                       ┌───────────────────┼───────────────────┐
                       │                   │                   │
              ┌────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
              │ Interview Core │ │ Pi Agent Runtime│ │ SQLite Session │
              │ state + policy │ │ language tasks  │ │ durable state  │
              └────────┬────────┘ └────────┬────────┘ └─────────────────┘
                       │                   │
                 ┌─────▼─────┐       ┌─────▼─────┐
                 │ Role Pack │       │ Skill Pack│
                 │ rubric    │       │ probes    │
                 └───────────┘       └───────────┘
```

### Dependency Direction

```text
web → server → interview-core
             → pi-runtime
             → SQLite

pi-runtime → interview-core types
interview-core → no runtime or provider package
```

`interview-core` is the domain boundary. Provider, transport, database, and UI code depend on it; it does not depend on them.

## 3. Component Responsibilities

### 3.1 Web Application

The web application:

- creates and restores interview sessions;
- displays the current project, topic, question, and progress;
- submits candidate answers;
- renders evidence, competency state, gaps, and decision traces.

It does not score evidence, choose a topic, generate authoritative state, or persist business data.

### 3.2 Application API

The API is the trust and durability boundary. It:

- validates request shape and size;
- loads and serializes a session;
- persists the raw answer before an external model call;
- invokes Pi language operations;
- validates model output;
- invokes domain state transitions;
- atomically persists the resulting evidence, competency updates, and trace;
- maps domain and provider failures to stable HTTP errors.

Only the API writes interview state.

### 3.3 Interview Core

The core owns:

- candidate, project, claim, topic, evidence, competency, and trace models;
- anchor-project selection;
- topic continuation, saturation, switching, and completion;
- claim-to-evidence linkage;
- competency score and confidence calculation;
- evidence-gap resolution;
- interview stop policy;
- deterministic state transitions.

Core functions accept plain data and return plain data. They do not call a model, database, filesystem, or network.

### 3.4 Pi Agent Runtime

Pi owns language-dependent operations:

- extracting structured evidence from a free-text answer;
- generating one natural question from an `InterviewDecision`;
- streaming assistant output;
- maintaining model-facing conversation history;
- loading the selected interview skill instructions.

Pi cannot mutate domain state. Its tools expose narrowly scoped reads and schema-validated proposals. Shell, arbitrary filesystem access, and arbitrary network tools are not available to the interview agent.

### 3.5 Role Pack

A Role Pack defines the stable assessment contract for one job family:

```text
role identity
competency weights
core competency flags
behavioral rubric
allowed skill mapping
stop thresholds
```

The model may interpret a rubric but may not rewrite weights or thresholds during a session.

### 3.6 Skill Pack

A Skill is a reusable investigation instruction selected for a known gap.

```text
Policy decides what evidence is missing.
Skill defines how to investigate it.
Pi expresses the selected probe as one question.
```

The initial common skills are:

- `ownership-grill` — separate personal contribution from team output;
- `metric-audit` — verify metric, baseline, dataset, and attribution;
- `failure-forensics` — reconstruct symptom, hypotheses, diagnosis, root cause, and prevention.

A Skill does not assign scores or change topic status.

### 3.7 SQLite Session Store

One row stores one complete serialized `InterviewState`. This keeps a turn update atomic and makes the session the unit of recovery.

Normalized reporting tables are projections, not additional sources of truth. They may be added for cross-session queries without changing domain ownership.

## 4. Canonical Domain Model

```text
CandidateProfile
└── Project[]
    ├── Claim[]
    └── TopicThread[]
        ├── EvidenceGap[]
        ├── Evidence references
        └── Turn references

InterviewState
├── CandidateProfile
├── InterviewTurn[]
├── Evidence[]
├── CompetencyState[]
├── DecisionTrace[]
├── status
└── currentQuestion
```

### 4.1 CandidateProfile

Contains resume-grounded facts and project claims. A resume statement creates an unverified Claim, never positive Evidence.

### 4.2 Project

The primary interview context. `candidate.projects` is the only canonical project collection. Project state must not be duplicated elsewhere in `InterviewState`.

### 4.3 Claim

A falsifiable statement from the resume or an answer. It records supporting, weak, and contradicting evidence IDs.

### 4.4 TopicThread

A bounded line of investigation within a project. It holds open gaps, evidence references, turn references, saturation, and expected information gain.

### 4.5 InterviewTurn

The immutable question-answer record. Turns are append-only. Summaries and model context never replace the original text.

### 4.6 Evidence

A structured interpretation of an exact answer fragment:

```text
turnId
projectId
topicId
claimIds
competencyId
statement
polarity
strength
specificity
evaluatorConfidence
sourceQuote
```

`sourceQuote` must be an exact substring of the referenced answer.

### 4.7 CompetencyState

Separates estimated ability from certainty:

- `score` describes the current evidence-weighted competency estimate;
- `confidence` describes whether enough specific, consistent evidence exists;
- `evidenceIds` provides traceability;
- `missingEvidence` prevents unsupported certainty;
- `contradictoryEvidence` exposes unresolved conflict.

### 4.8 DecisionTrace

Records why a question exists:

```text
turnId
action
projectId
topicId
selectedSkill
selectedProbe
targetGap
reason
generatedQuestion
model / prompt / schema versions when applicable
```

## 5. Domain Invariants

1. Raw turns and evidence are append-only.
2. Resume claims start `unverified` and do not affect competency scores.
3. Every Evidence references one existing Turn and at least one competency.
4. Every `sourceQuote` is present verbatim in the referenced answer.
5. Claim status changes only through linked Evidence.
6. Competency score and confidence derive only from Evidence.
7. A resolved gap identifies the Evidence that resolved it.
8. Policy decisions are deterministic for the same state.
9. Every generated question has a Decision Trace.
10. Model failure produces no evidence; it never produces inferred fallback facts.
11. One session has at most one active Project and one active Topic.
12. A completed session rejects further answers.

## 6. Interview State Machine

```text
DRAFT
  └─ start → ACTIVE

ACTIVE
  ├─ answer + CONTINUE_TOPIC → ACTIVE
  ├─ answer + SWITCH_TOPIC   → ACTIVE
  ├─ answer + SWITCH_PROJECT → ACTIVE
  ├─ answer + SCENARIO_PROBE → ACTIVE
  └─ answer + FINISH         → COMPLETED

COMPLETED
  └─ terminal
```

Policy actions are:

```text
CONTINUE_TOPIC
SWITCH_TOPIC
SWITCH_PROJECT
SCENARIO_PROBE
CLARIFY_CONTRADICTION
GENERAL_PROBE
FINISH
```

Decision order:

1. clarify a material contradiction;
2. continue an active high-value gap;
3. switch to the best remaining topic in the project;
4. switch to the best remaining project;
5. use a scenario for an uncovered core competency;
6. finish when no high-value gap remains or the hard turn limit is reached.

## 7. Answer Command

`POST /api/interviews/:id/answer` executes one serialized command:

```text
validate request
  → load active session
  → append and persist Raw Turn
  → build minimum extraction context
  → Pi extracts Evidence proposal
  → validate schema, IDs, ranges, and sourceQuote
  → append accepted Evidence
  → update linked Claims
  → update Competency State
  → resolve or retain Gaps
  → run deterministic Policy
  → select Skill and Probe
  → Pi generates one Question
  → append Decision Trace
  → persist state
  → return state, decision, evidence, and question
```

Only one answer command may execute per session at a time. A repeated command for an already-consumed question is rejected rather than applied twice.

## 8. Model Contracts

### 8.1 Evidence Extraction Input

The extractor receives only:

```text
current question
candidate answer
active project and topic
relevant claims
open evidence gaps
relevant competency rubric
recent turns required for local context
```

It does not receive unrelated sessions, filesystem data, or arbitrary tools.

### 8.2 Evidence Extraction Output

```json
{
  "evidence": [
    {
      "claimIds": ["claim_rag_ownership"],
      "competencyId": "software_engineering",
      "statement": "The candidate described their implementation ownership.",
      "polarity": "support",
      "strength": 0.8,
      "specificity": 0.75,
      "evaluatorConfidence": 0.8,
      "sourceQuote": "I designed the retrieval flow and implemented..."
    }
  ]
}
```

Validation rules:

- IDs must exist in the active session context;
- numeric fields are finite and in `[0, 1]`;
- polarity is `support`, `weakness`, or `invalidate`;
- source quote is non-empty and verbatim;
- invalid items are rejected, not repaired into facts;
- one retry is allowed for schema-invalid model output.

### 8.3 Question Generation Input

The generator receives the deterministic decision, selected Skill, active context, target gap, relevant evidence, and recent turns.

The output is one concise question. It must not reveal the rubric, assume an unverified claim is true, suggest the desired answer, or combine multiple primary questions.

## 9. Scoring and Policy

Evidence quality is based on strength, specificity, evaluator confidence, polarity, and consistency. Score and confidence are calculated separately and stored with their evidence IDs.

The scorer is versioned. Recalculation with the same scorer version and evidence set must produce the same result.

Topic utility uses:

```text
competency importance
× gap importance
× project relevance
× expected information gain
× conversational continuity
− repetition penalty
− fatigue penalty
```

The policy consumes stored values; the LLM does not choose or alter weights.

## 10. Persistence and Recovery

The session record contains:

```text
session id
serialized InterviewState
created timestamp
updated timestamp
```

Durability rules:

- the raw answer is durable before model inference begins;
- accepted evidence and its state updates commit together;
- a provider failure leaves the session recoverable at the unanswered inference step;
- a process restart reloads the current question and state from SQLite;
- schema migrations are explicit and preserve raw turns.

## 11. HTTP API

```text
GET  /api/health
GET  /api/roles
POST /api/interviews
POST /api/interviews/:id/start
POST /api/interviews/:id/answer
GET  /api/interviews/:id/state
```

### Response Semantics

- `400` — invalid request body;
- `404` — unknown interview or role;
- `409` — command conflicts with session state;
- `422` — model output failed domain validation;
- `503` — model provider unavailable after retry;
- `500` — unexpected server failure.

Errors do not include provider secrets, prompts containing unrelated candidate data, or stack traces.

## 12. Observability

Each model-backed turn records:

```text
session and turn IDs
action, gap, skill, and probe
model provider and model ID
prompt version
schema version
latency
retry count
accepted and rejected evidence counts
```

Logs reference IDs rather than duplicating full resumes and answers. Raw candidate text remains in the session store.

## 13. Security Boundary

- Candidate input is untrusted data, never executable instructions.
- Interview agents receive no shell, write, edit, or unrestricted network tools.
- Provider keys are server-side environment secrets.
- Resume and answer size limits are enforced at the API.
- Model output is untrusted until schema and domain validation pass.
- Session access is scoped by its API authorization boundary when accounts are introduced.

## 14. Verification Structure

### Domain Tests

Pure tests cover anchor selection, gap priority, topic switching, hard limits, claim linkage, score calculation, and terminal-state rejection.

### Model Contract Tests

A fixed corpus covers specific answers, vague answers, denied ownership, metric claims, contradictions, and unrelated answers. Tests assert schema validity, quote traceability, polarity, and stable policy results.

### HTTP Session Tests

Tests execute create → start → answer → state reload and verify SQLite durability and idempotency.

### Manual Conformance Test

The deterministic interview mode is suitable for checking UI, API, persistence, and state transitions:

```bash
npm install
npm run dev
```

In another terminal:

```bash
npm run dev:web
```

Open <http://localhost:5173>, create a session, and use:

```text
Answer 1:
我负责检索架构设计，并独立实现切分、召回和 reranker 接入。

Answer 2:
准确率按人工标注测试集上的正确回答比例计算，基线为未加 reranker 的版本。
```

Expected behavior:

- ownership evidence links to the original quote and claim;
- the ownership gap resolves and policy switches to evaluation;
- evaluation evidence links to the metric claim;
- competency state and traces persist after API reload;
- the session completes without duplicate updates.

### Human Interview Test Eligibility

A model-backed human interview test is eligible only when all conditions hold:

- Pi Evidence Extraction passes schema and quote validation;
- fixed regression cases cover specific, vague, denied, contradictory, and unrelated answers;
- ownership, metric, and failure-forensics skills are available;
- question generation produces one question per turn;
- sessions support 6–10 turns and all policy transitions under test;
- at least three fixed profiles cover strong, weak, and contradictory evidence;
- provider timeout and retry preserve the session;
- the UI exposes current topic, gap, evidence, and trace;
- every evidence item and next question is traceable to stored state.

Until these conditions pass, manual use verifies system plumbing, not interview quality or candidate ability.

## 15. Repository Structure

```text
apps/
├── server/                 HTTP, validation, persistence, orchestration
└── web/                    candidate and assessment UI

packages/
├── interview-core/         domain model, state transitions, scoring, policy
└── pi-runtime/             model operations and controlled tools

roles/                      role weights and rubrics
skills/                     interview investigation instructions
docs/architecture.md        authoritative system structure
```
