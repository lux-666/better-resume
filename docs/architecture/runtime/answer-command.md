# 回答命令

[返回 Runtime](README.md) · [返回架构 Map](../README.md)

`POST /api/interviews/:id/answer` 是一次序列化命令。逻辑顺序固定为：

```text
校验请求
  → 加载 active Session
  → 追加并持久化 Raw Turn
  → 构建最小提取上下文
  → Pi 提出 Evidence
  → 校验 Schema、ID、数值范围和 sourceQuote
  → 追加已接受 Evidence
  → 更新关联 Claim
  → 更新 Competency State
  → 解决或保留 Gap
  → 执行确定性 Policy
  → 选择 Skill 与 Probe
  → Pi 生成一个 Question
  → 追加 DecisionTrace
  → 持久化完整状态
  → 返回 Step
```

## 命令输入

```json
{
  "answer": "候选人的原始回答"
}
```

`answer` 必须是去除首尾空白后仍非空且不超过 10,000 字符的字符串。Session 必须存在、处于 `active` 且正在等待 Answer。

## 命令输出

```text
state       完整 InterviewState
decision    下一步确定性决策
question?   下一问题；FINISH 时不存在
evidence[]  本轮接受的 Evidence
```

## 并发与幂等

同一 Session 同时只能执行一个 Answer 命令。服务器必须把被回答的 Question 标识纳入冲突判断；已消费 Question 的重复命令返回 `409`，不能重复追加 Turn 或 Evidence。

## 持久化边界

Raw Turn 必须在外部模型调用前可恢复。Evidence、Claim、Competency、Gap 和 Trace 的更新作为一个完整状态提交；任何校验失败都不能留下部分 Evidence 更新。

当前本地路径没有外部模型调用，一次 `submitAnswer` 后直接保存完整 State。模型接入不得削弱上述恢复和原子性约束。

## 失败语义

- 请求无效：不创建 Turn；
- Session 状态冲突：不调用模型；
- 模型超时：保留可恢复的 Raw Turn，不生成 Evidence；
- 模型输出无效：允许一次格式重试，仍无效则返回 `422`；
- 持久化失败：不向调用方报告成功；
- `completed` Session：拒绝所有新 Answer。

调用方重试前必须重新读取 Session 状态，不能凭客户端缓存推断上一条命令是否提交。
