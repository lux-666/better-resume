# 模型契约

[返回 Runtime](README.md) · [返回架构 Map](../README.md)

模型只执行两个语言任务：Evidence Extraction 和 Question Generation。两者使用独立输入和输出契约。

## Evidence Extraction

### 输入

提取器只接收：

```text
当前 Question
候选人 Answer
active Project 与 Topic
相关 Claims
open Evidence Gaps
相关 Competency rubric
维持局部语义所需的最近 Turns
```

它不接收其他 Session、无关简历内容、文件系统数据或任意工具。

### 输出

```json
{
  "evidence": [
    {
      "claimIds": ["claim_rag_ownership"],
      "competencyId": "software_engineering",
      "statement": "候选人说明了本人负责的实现。",
      "polarity": "support",
      "strength": 0.8,
      "specificity": 0.75,
      "evaluatorConfidence": 0.8,
      "sourceQuote": "我负责检索架构设计，并独立实现……"
    }
  ]
}
```

### 校验

- `claimIds` 和 `competencyId` 必须存在于本轮上下文；
- `strength`、`specificity`、`evaluatorConfidence` 必须是 `[0, 1]` 内的有限数；
- `polarity` 只能是 `support | weakness | invalidate`；
- `sourceQuote` 非空且逐字存在于当前 Answer；
- 输出不得引用非 active Project 或 Topic；
- 非法 item 整体拒绝，不能被服务器改写成事实；
- Schema 无效时最多重试一次。

零条 Evidence 是合法结果，表示 Answer 没有提供可接受证据。

## Question Generation

生成器接收：

```text
InterviewDecision
selected Skill
active Project 与 Topic
target Gap
相关 Evidence
避免重复所需的最近 Turns
```

输出必须是一个简洁的主问题，并满足：

- 不泄露 Rubric 或内部评分；
- 不把未验证 Claim 当成事实；
- 不暗示期待答案；
- 不组合多个主问题；
- 不偏离 Policy 指定的 Project、Topic 和 Gap；
- 与最近问题不重复。

Question 不具有状态权威性；只有连同 DecisionTrace 保存后才成为当前问题。

## 版本与回放

每次模型调用记录：

```text
provider
modelId
promptVersion
schemaVersion
latency
retryCount
```

回归数据保存输入、结构化输出和验收结果，不保存无法追溯来源的模型总结。Schema 或 Prompt 改变时必须显式更新版本，以便解释同一 Answer 为何得到不同 proposal。
