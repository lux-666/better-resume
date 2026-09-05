# Task 3.4：路演就绪

[返回 Phase 3](README.md)

## 目标

让路演的每一分钟都能对应到一个真实运行的界面状态，评委能在现场看到追问抓住能力边界、报告成形、技术链路可解释三件事。

## 演示档案

固定三份 Intake 与对应的回答脚本，存放在 `data/demo-profiles/`，由 Git 跟踪：

| 档案 | 输入 | 演示高光 | 预期时长 |
| --- | --- | --- | ---: |
| `demo-strong` | 双项目、完整 JD | 第 3 问沿 Lead 追到第 4 层取舍，报告 `continue_process` | 4 轮 |
| `demo-boundary` | 单项目、完整 JD | 第 2 层稍具体，第 3 层两次含糊，Agent 换话题，报告写出边界 | 5 轮 |
| `demo-contradictory` | 双项目、无 JD | 回答否认候选人输入 Claim，contradiction open → 澄清 → resolved | 6 轮 |

回答脚本是候选人在现场按顺序输入的文本，不是预写的 State。演示者可以临场改动一句话，链路必须仍能完成。

## 技术面板

页面新增审核模式 Tab“技术视图”，读取已有 telemetry 表：

- 本轮实际 Agent 与尝试、模型请求的模型、耗时、输入 / 输出 token、重试和工具纠错次数；
- 实时 Trace/Span 树或时间轴：父子关系、运行状态、开始偏移、耗时、校验拒绝及结构化 blockers；
- 本 Session 累计 token 与 p50 / p95 延迟；
- 本轮 `read_report` 视图体积与 Lead 命中；
- Decision Trace：目标字段、目标层级、reason、被拒绝的 finish 与 blockers；
- Phase 4 上线后增加检索命中片段与记忆召回。

技术面板只读 telemetry 与 State，不新增数据源；本轮与 Session 统计、评测共用 3.0 的聚合函数。p50/p95 附样本数与统计范围。

## 演示脚本

`docs/phase/phase3/` 不存脚本正文，脚本放 `data/demo-profiles/script.md`，包含：每一步操作、预期界面状态、对应评审项、备用话术（模型延迟高或 Provider 失败时说什么）。

时间分配建议：

```text
0:00–1:00  问题与定位：招聘方要证据，候选人要反馈
1:00–4:00  demo-boundary 现场面试，右栏实时进度
4:00–5:30  报告成形：边界结论、原话引用、双边建议
5:30–7:00  技术视图：双 Agent、护栏拒绝、Trace、模型分工
7:00–8:00  demo-contradictory 快速回放矛盾生命周期
```

## 稳定性预案

- 演示前 `npm run eval:phase3` 用真实模型跑完三份档案，3/3 通过才允许上台；
- 演示机器上预置一份已完成的三档案 Session，Provider 不可用时切到回放模式；回放模式在界面明确标注“回放”，不伪装为实时；
- `LLM_TIMEOUT_SECONDS` 演示配置收紧到 30，单次重试保留；
- 网络不可用时的最低保障是 Demo 模式，界面明确显示 Demo。

## 验收

- 三份演示档案在真实模型下连续 3/3 完成，Critical/Major 为 0；
- 演示脚本每一步都能在页面上找到对应状态截图；
- 技术视图数字与 `GET /api/interviews/:id/traces` 一致；
- 回放模式与实时模式界面区分明显，任何人不会误认；
- 慢响应、重试、断线重连、刷新恢复演示均有明确过程和终态。
