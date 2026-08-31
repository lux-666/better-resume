# Better Resume 架构 Map

本文档是系统架构的唯一入口。文档按三层组织：

1. 本页：系统总览、依赖方向和文档地图；
2. 板块页：定义板块职责、边界和内部组成；
3. 细节页：定义数据、流程、接口、安全和测试契约。

## 系统目标

Better Resume 是证据驱动的自适应面试系统。输出不是对对话的印象，而是每个判断都能追溯到候选人原话的能力评估。

```text
简历 Claim
  → Evidence Gap
  → 确定性 Policy
  → Lead / Probe / Skill
  → Question
  → Raw Answer
  → Evidence / Probe coverage / follow-up Leads
  → Claim / Competency / Gap / Lead 更新
  → 下一次 Policy 决策
```

模型负责语言理解与表达；确定性应用代码负责状态、评分、路由、停止条件和持久化。

运行事实与产品进度是两个独立投影：DecisionTrace 记录每轮 Evidence/Question 的实际执行来源；InterviewProgress 从持久化 State 与 Role Pack 计算，不由浏览器或模型估算。

## 系统地图

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

## 文档地图

| 二级板块 | 唯一职责 |
| --- | --- |
| [Agent 持续对话](agent/README.md) | 单 Interview Agent 的跨轮上下文与模型边界 |
| [胜任力与证据](competency/README.md) | 领域对象、Role Pack、Evidence 与评分 |
| [Interview Policy 与 Skills](interview/README.md) | 状态机、调查路由、Skill 与停止条件 |
| [简历理解](resume/README.md) | Resume 到 Candidate、Claim、Topic 与 Gap 的转换 |
| [产品 Session](product/README.md) | Web、API、SQLite、安全与可观测性 |
| [Evaluation 与真人准入](evaluation/README.md) | 自动化、系统走查、模型回归与真人测试门槛 |

## 依赖方向

```text
web → server → interview-core
             → pi-runtime
             → SQLite

pi-runtime → interview-core types
interview-core → no runtime or provider package
```

`interview-core` 是领域边界。传输、数据库、模型提供商和 UI 可以依赖它；它不反向依赖这些实现。

## 硬边界

- `candidate.projects` 是 Project 的唯一权威集合。
- 简历 Claim 初始为 `unverified`，不能直接成为正向 Evidence。
- Raw Turn 与已接受 Evidence 只追加，不覆盖原文。
- 每条 Evidence 的 `sourceQuote` 必须是对应 Answer 的原文子串。
- Pi 只能提出结构化结果，不能直接修改领域状态。
- Demo 与 LLM 是显式运行模式；配置 LLM 后调用失败必须返回错误，不能静默退回 Demo。
- API 是请求校验和持久化边界；只有 API 写入 Session。
- InterviewProgress 只从 State 与 Role Pack 派生，不作为第二份可写状态。
- 同一状态必须产生同一 Policy 决策。
- 已完成的 Session 拒绝新的 Answer。

## 代码地图

```text
apps/web                 候选人界面
apps/server              HTTP API 与 SQLite Session Store
packages/api-contract    可执行 HTTP 请求、响应与错误 Schema
packages/interview-core  领域状态与确定性策略
packages/pi-runtime      Pi Agent 安全适配层
roles                    岗位能力与阈值
skills                   可复用调查指令
```

运行当前闭环和真人测试准入均由 Evaluation 板块统一维护。
