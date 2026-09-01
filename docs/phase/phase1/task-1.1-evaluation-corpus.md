# Task 1.1：建立行为评测语料

[返回 Phase 1](README.md)

| 属性 | 值 |
| --- | --- |
| 状态 | Planned |
| 优先级 | P0 |
| 依赖 | 无 |

## 目标

用最少但高信号的候选人 Profile 覆盖 Interview Agent 最可能失败的行为，为后续真实模型 Gate 提供稳定输入。不是追求语料数量，而是确保每种关键风险至少有一个可复现案例。

## 开发范围

复用现有 strong、weak、contradictory Profile，并补充以下场景：

| 场景 | 候选人行为 | Agent 必须做到 |
| --- | --- | --- |
| multi-field | 一次回答同时给出 ownership、mechanism 和 measurement | 将 Evidence 写入所有被原话支持的 Report field，不重复追问已充分内容 |
| vertical-depth | 回答依次暴露 `hybrid search → RRF → top-k` | 至少沿一个具体新线索纵向追问，而非立刻机械切字段 |
| vague | 回答“记不清”“感觉更好” | 保留 weak，不补写为 supported |
| irrelevant | 回答与当前调查无关 | 不生成 Evidence，并换一种有效问法或调查目标 |
| contradiction | 候选人否认或修正 Resume Claim | 创建并澄清 contradiction，保留历史 invalidate Evidence |
| premature-finish | Report 仍有 required missing field | `finish_interview` 被拒绝后继续询问 blocker |

每个 Profile 必须定义：

- 稳定的候选人回答规则；
- 必须成立的确定性不变量；
- 允许 Agent 自由选择的调查路径；
- 成功退出条件和最大轮数；
- 失败时需要保留的最小 Transcript。

## 建议代码触点

- `packages/interview-core/src/fixed-profiles.ts`
- `apps/server/src/evaluate-profiles.ts`
- 对应的最小测试文件

不新建通用 Profile DSL；现有 TypeScript 数据和函数足够时直接扩展。

## 交付物

- 至少覆盖上表六类风险的版本化 Profile；
- 每个 Profile 有自动断言；
- `eval:model` 可以按单个 Profile 或全部 Profile 运行。

## 验收标准

- 相同 Profile 输入不依赖随机候选人回答；
- 六类风险均有独立失败信号；
- 自动测试不要求唯一问题措辞或唯一调查顺序；
- Profile 失败时能定位到具体轮次、Question、Answer 和 Report edit；
- `npm test`、`npm run typecheck` 继续通过。

## 不做

- 大规模合成语料；
- LLM-as-judge；
- 为 Profile 新建框架、数据库或配置语言；
- utility、Lead、Probe 或 Skill 路由。

## 完成后回填：具体实现与验证

- **实现：**
- **验证：**
- **结果：**
- **代码/报告链接：**
