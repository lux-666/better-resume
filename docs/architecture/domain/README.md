# Domain 板块

[返回架构 Map](../README.md)

Domain 定义“系统认为什么是真的”以及“一轮回答后状态如何变化”。代码边界是 `packages/interview-core`，输入和输出均为普通数据，不调用模型、数据库、文件系统或网络。

## 职责

- 管理 Candidate、Project、Claim、Topic、Gap、Turn、Evidence、Competency 和 Trace；
- 选择 Anchor Project 与当前 Topic；
- 将已验证 Evidence 关联到 Claim 和 Competency；
- 计算分数、置信度与缺失证据；
- 决定继续、切换或结束；
- 拒绝非法状态转换。

## 不负责

- 不解析 HTTP 请求；
- 不加载或保存 Session；
- 不生成自然语言；
- 不信任或修复模型输出；
- 不渲染 UI。

## 内部结构

```text
InterviewState
├── CandidateProfile
│   └── Project[]
│       ├── Claim[]
│       └── TopicThread[]
│           └── EvidenceGap[]
├── InterviewTurn[]
├── Evidence[]
├── CompetencyState[]
├── DecisionTrace[]
├── status
└── currentQuestion
```

## 细节入口

- [领域模型](model.md)：对象的含义、所有权与引用关系；
- [不变量与状态机](invariants-and-state-machine.md)：状态转换、Policy 顺序和评分边界。

## 对外契约

| 函数 | 输入 | 输出 |
| --- | --- | --- |
| `createInterviewState` | Session、Role、Candidate | `draft` 状态 |
| `selectAnchorProject` | Project 列表 | 价值最高的 Project |
| `startInterview` | `draft` 状态 | 首个决策、问题和 `active` 状态 |
| `submitAnswer` | `active` 状态、Answer | Turn、Evidence、下一决策和问题 |
| `getNextInterviewAction` | 任意有效状态 | 确定性 `InterviewDecision` |

调用方必须把一次领域转换视为一个整体，不得单独拼装部分状态更新。
