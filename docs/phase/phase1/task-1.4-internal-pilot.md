# Task 1.4：小规模内部体验验收

[返回 Phase 1](README.md)

| 属性 | 值 |
| --- | --- |
| 状态 | Completed：产品负责人完成 A/B 两个 Session，结论为 Go |
| 优先级 | P1 |
| 依赖 | 真实模型行为 Gate 连续三次通过 |

## 目标

验证自动化难以可靠判断的连贯性、审讯感、关键线索漏追和最终 Candidate Report 可用性，决定产品是否具备进入 Phase 2 的条件。

Task 1.4 不是再跑一遍固定 Profile。固定 Profile 已经证明确定性行为 Gate；这里要观察真人面对问题时是否理解、愿意继续回答，以及完成后的 Report 是否能支持人工判断。

## 最终采用的测试规模

- 产品负责人明确批准以 1 名测试者、两个 Session 作为本阶段最低定性 Pilot；
- 完成场景 A 和场景 B 各一个 Session；
- 本结论不宣称具备多测试者统计代表性；
- 所有 Session 使用同一已通过 Gate 的模型配置；
- 不在 Session 中人工修改 `InterviewState`、Evidence、问题或 Completion 结果；
- Provider 故障不算体验失败，记录后使用新 Session 重做该场景。

测试者使用匿名编号 `P01`–`P05`。不要在候选人姓名中填写真实姓名、公司、客户或其他个人信息。

## 启动前检查

当前行为基线：

- 模型配置：`openai_compatible / gpt-5.6-terra`；
- 六 Profile 完整 Gate：连续 3/3 通过；
- 仓库验证：`npm test` 32/32、`npm run typecheck`、`npm run build` 通过；
- Task 1.4 使用 `?pilot=1`，面试进行中隐藏 Report、Evidence 和 Trace，完成后开放审核；
- Pilot Session 可以下载 JSON，包含开始时间、导出时间、耗时、Runtime、完整 State、Progress 和 Trace。

启动隔离的 Pilot 环境：

```bash
DATABASE_PATH=data/phase1-pilot/pilot.db npm run dev
```

打开：

```text
http://127.0.0.1:5173/?pilot=1
```

开始测试前必须确认页面顶部显示：

```text
LLM 已连接 · openai_compatible/gpt-5.6-terra
```

如果显示 Demo 模式，立即停止；该 Session 无效。

## 两个标准场景

每名测试者都执行 A、B 两个场景。事实内容固定用于可比性，但回答措辞必须由测试者自己组织，不要逐字照读。

### 场景 A：强证据与纵向深挖

Session 名称填写 `Pxx-A`，例如 `P01-A`。

测试者扮演确实主导两个项目的候选人。只有被问到时再提供对应事实，不要在第一轮一次性背完所有内容。

企业 RAG 可用事实：

- 个人负责分块、召回、融合、rerank 和上线验证；
- 最初只用 dense retrieval，短查询表现差，后来加入 BM25 形成 hybrid search；
- BM25 和 dense 各召回 50 条，使用 RRF 融合，再 rerank 到 20 条；
- 没有直接加权两路 score，因为分数难以稳定校准；
- 固定 200 条人工标注问题，准确率由 70% 提升到 85%；
- 短商品名曾召回为空，通过检索日志定位，修复后 Recall@20 从 76% 到 84%，增加回归集和告警。

客服 Agent 可用事实：

- 个人主导状态机、工具编排、人工升级和 TypeScript 核心工作流；
- 工具超时只重试一次，仍失败时保留上下文转人工；
- 写操作使用幂等键；
- 相同 20 RPS、500 条请求下，延迟从 1200 ms 降到 840 ms，成功率没有下降；
- 支付查询曾因超时重试造成重复调用，通过 traceId 定位并增加幂等键、故障注入回归和告警。

必须自然暴露至少一个可纵向追问的命名线索，例如 `hybrid search`、`RRF`、`幂等键` 或 `故障注入`。

场景 A 主要观察：

- Agent 是否立即追问刚出现的具体机制或选择；
- 是否能把一个回答中的多个事实写入多个 Report field；
- 是否在 Report 足够后自然结束，而不是机械遍历或拖到 15 轮；
- 完成后的 Report 是否准确区分 ownership、mechanism、measurement 和 failure。

### 场景 B：弱证据、Claim 修正与偏题恢复

Session 名称填写 `Pxx-B`，例如 `P01-B`。

测试者扮演简历表述偏强、实际参与有限的候选人：

- 首次被问 ownership 时，明确说明核心设计并非自己完成，只按既定方案做局部配置；
- 后续澄清准确职责是接口联调，没有主导整体设计；
- mechanism 问题回答“方案由同事确定，只知道使用现成组件”；
- measurement 问题回答没有保留基线、固定测试集或统计口径；
- failure 问题回答问题由同事定位，自己只协助复现；
- 在任意一次非 Claim 澄清问题上故意偏题一次，例如说“我更想聊最近的天气”；下一问恢复按场景回答；
- 不要为了让 Agent 结束而虚构强证据。

场景 B 主要观察：

- 偏题后是否换一种有效问法，而不是写入虚假 Evidence；
- vague 是否保持 weak，而不是升级为 supported；
- Claim 否认是否创建 contradiction，后续准确澄清后是否 resolved；
- 相同弱信息出现后是否停止反复追问；
- Agent 是否接受 weak/contradicted 是合法结论，并在无 blocker 时结束。

## 单个 Session 的执行步骤

1. 测试者只阅读自己对应的场景卡；观察者打开本记录模板。
2. 使用匿名名称创建 Session，例如 `P01-A`。
3. 点击“开始面试”时开始计时。Pilot JSON 会保存浏览器记录的 `startedAt`。
4. 面试过程中只操作左侧面试区域。不要通过开发者工具、API 或其他窗口查看 Report。
5. 测试者按自己的语言回答；可以停顿和追问理解，但不能修改 Resume Claim 或系统状态。
6. 观察者记录明显问题的轮次，不在过程中指导测试者如何回答。
7. Session 完成后，先让测试者独立给出连贯性、审讯感和总体体验评分。
8. 再查看右侧 Candidate Report、Evidence 和 Trace，完成 Report 可用性与 grounding 审核。
9. 点击“下载 Pilot Session JSON”。文件名包含 `sessionId`。
10. 使用 [Session review 模板](task-1.4-session-review-template.md) 完成记录。
11. 点击“新建 Session”，执行下一个场景。

若 Agent 达到 15 轮但页面没有合法完成，或出现无法继续的模型输出错误，仍下载当前 JSON，并将结果标记为 incomplete。

## 每个 Session 必须记录

| 指标 | 记录方式 |
| --- | --- |
| Tester / Scenario | `Pxx-A` 或 `Pxx-B` |
| sessionId | 页面与 JSON 中的 UUID |
| 模型配置 | JSON `runtime`，必须与基线一致 |
| 完成状态 | completed / incomplete / provider-invalid |
| 完成轮数与时间 | JSON `progress.turns.completed`、`durationMinutes` |
| 重复或无关问题 | 记录问题轮次和原文 |
| 关键线索漏追 | 记录 Answer 线索及下一问 |
| 过早结束或无效拖延 | 记录最后相关的 1–3 轮 Transcript |
| grounding 错误 | 对照每条 Evidence `sourceQuote` 与对应 Turn Answer |
| Claim / contradiction | 对照否认、澄清和最终 open/resolved 状态 |
| Report 可用性 | 1–5 分及一句原因 |
| 对话连贯性 | 1–5 分及一句原因 |
| 审讯感 | 1–5 分，5 表示自然、1 表示强烈审讯感 |
| 总体体验 | 1–5 分及一句原因 |

## 问题级别

### Critical：立即停止整批测试

- Evidence `sourceQuote` 不在对应 Answer；
- 把一名测试者的内容带入另一名测试者 Session；
- unknown Claim/Field/Competency 被写入 State；
- open contradiction 或 required field missing 时正常完成；
- 候选人无关回答被写成 substantive Evidence；
- 泄露 API Key、内部 Prompt 或其他不应向测试者显示的数据。

发现 Critical 后：保存 JSON 和最小 Transcript，停止新增 Session，回到 Task 1.3 修复并重新跑完整模型 Gate。

### Major：重复出现才阻塞

- 同义或完全重复问题；
- 明确命名线索后立刻切题，漏掉高价值纵向追问；
- Report 已充分仍持续无效追问；
- weak/contradicted 被当成必须补成 supported；
- 偏题后无法恢复有效调查；
- 问题持续机械、难以理解或带明显审讯感。

同类 Major 在两个或更多 Session 出现，或单次严重到无法完成 Session，视为阻塞问题。

### Minor：记录但不直接改产品

- 单个措辞偏好；
- 一次可理解但不够自然的 acknowledgement；
- 不影响 Report 的轻微顺序差异；
- 测试者个人偏好的问题长度或语气。

## Go / No-Go 规则

本轮按产品负责人明确批准的两 Session 范围验收。只有同时满足以下条件才记为 Go：

- P01-A、P01-B 两个有效 Session；
- 所有有效 Session 使用同一模型配置；
- Critical 为 0；
- 没有未解决的阻塞 Major；
- 每个 Session 都有 JSON 和 review 记录；
- 产品负责人查看 Session 与汇总后明确认为没有阻塞体验问题并签署 Go。

不满足任一条件即为 No-Go 或继续收集，不允许因为平均分尚可而忽略 Critical/重复 Major。

## 数据与归档

- 原始 Session JSON 和未匿名观察记录属于运行数据，不提交 Git；
- 建议存放在 `data/phase1-pilot/raw/`，该目录已被 `.gitignore` 排除；
- 只把匿名化汇总、阻塞问题最小 Transcript 和最终 Go/No-Go 结论写回仓库文档；
- 不保存 API Key、真实姓名、公司秘密或与测试目标无关的个人信息。

## 交付物

- P01-A、P01-B 两个匿名化 Session JSON；
- 每个 Session 一份 review；
- 汇总指标表；
- 阻塞问题的最小 Transcript；
- Phase 1 的 Go / No-Go 结论；
- No-Go 时需要回到 Task 1.3 的明确问题列表。

## 完成记录

- **测试范围：** 1 名产品负责人，P01-A 与 P01-B 两个真实模型 Session；
- **模型配置：** `openai_compatible / gpt-5.6-terra`；
- **有效 Session：** 2/2，分别为 3 轮、8.66 分钟和 9 轮、25 分钟；
- **Critical / Major / Minor：** Critical 0；阻塞 Major 0；非阻塞 Major 观察 1；Minor 0；
- **阻塞问题：** 无；
- **Go / No-Go：** Go；
- **限制：** 真人 Session 未覆盖 Claim 否认/澄清和偏题恢复；P01-A 有一次未重复的命名线索漏追；
- **匿名化报告链接：** [Pilot Summary](task-1.4-pilot-summary.md)。
