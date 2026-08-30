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
  → Skill / Probe
  → Question
  → Raw Answer
  → Evidence
  → Claim / Competency / Gap 更新
  → 下一次 Policy 决策
```

模型负责语言理解与表达；确定性应用代码负责状态、评分、路由、停止条件和持久化。

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

| 二级板块 | 板块职责 | 三级细节 |
| --- | --- | --- |
| [Domain](domain/README.md) | 领域对象、状态、评分与 Policy | [领域模型](domain/model.md) · [不变量与状态机](domain/invariants-and-state-machine.md) |
| [Runtime](runtime/README.md) | 回答命令、模型调用与 Skill 执行 | [回答命令](runtime/answer-command.md) · [模型契约](runtime/model-contracts.md) |
| [Platform](platform/README.md) | Web、API、持久化、安全与可观测性 | [API 与持久化](platform/api-and-persistence.md) · [安全与可观测性](platform/security-and-observability.md) |
| [Verification](verification/README.md) | 自动验证、人工走查与真人测试准入 | [自动化测试](verification/automated-tests.md) · [人工测试](verification/manual-tests.md) |

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
- API 是请求校验和持久化边界；只有 API 写入 Session。
- 同一状态必须产生同一 Policy 决策。
- 已完成的 Session 拒绝新的 Answer。

## 代码地图

```text
apps/web                 候选人界面
apps/server              HTTP API 与 SQLite Session Store
packages/interview-core  领域状态与确定性策略
packages/pi-runtime      Pi Agent 安全适配层
roles                    岗位能力与阈值
skills                   可复用调查指令
```

要运行当前闭环，从[人工测试](verification/manual-tests.md)开始；要判断何时可以进行模型驱动的真人测试，查看同页的准入清单。
