# Better Resume

以完成 Candidate Report 为目标的证据驱动 Interview Agent。`interview-core` 保存 Report、Claim、Evidence、Competency 和确定性护栏；`pi-runtime` 让 Agent 读取 Report、提交 grounded edit、自主提问或请求结束。

## 当前可运行内容

- React / Vite 多 Project Demo 面试与实时 Candidate Report、Evidence、DecisionTrace 面板
- 姓名、技能、多项目经历表单；可选 Resume/JD 上传自动回填；简历全文仅在勾选同意后保存与索引
- 原生 Node HTTP API、`node:sqlite` Session 持久化、进程恢复与 Answer 租约
- 可执行 HTTP Schema、幂等 Answer Command、旧问题拒绝与 Provider 单次重试
- `read_report → edit_report → ask_candidate / finish_interview` Agent 主链
- Evidence 原话校验、重要报告字段覆盖、矛盾检查、单问题约束和 可配置的 5–50 轮上限（默认 15）
- 客观、完整、可追溯并包含招聘建议的 Candidate Report JSON/Markdown 下载
- 面试官知识 RAG：20 张可追溯卡片、独立 embedding 配置、本地 SQLite 向量检索、知识引用与技术视图
- 单会话长程记忆：1500 字符来源摘要、按需 recall 早期回答与证据
- JD Role Pack、逐条岗位要求矩阵、可选简历全文检索与删除
- SQLite 本地历史、完整对话、继续面试、会话导出/删除、在线数据库备份
- 可选备用模型恢复与 20–60 分钟时长提醒
- 强、弱、矛盾三类固定 Profile

## 文档导航

- [系统架构与能力进度](docs/architecture/README.md)
- [单一来源、必要分层与维护检查](docs/development/single-source-workflow.md)

## 启动

要求 Node.js 22.19+。从 GitHub 下载 ZIP 并解压，或克隆仓库后进入项目目录。

```bash
npm install
npm run dev
```

默认使用确定性 Demo Agent。要运行真实模型，复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
npm run dev
```

生产静态模型分工通过环境变量配置，当前批准方案为 Report 使用快速模型、Interview 使用强模型：

```dotenv
LLM_REPORT_MODEL=gpt-5.6-terra
LLM_INTERVIEW_MODEL=gpt-5.6-sol
```

可选启用面试官知识检索（应用与数据库在本机，模型仍调用配置的 API）：

```dotenv
LLM_EMBEDDING_MODEL=qwen3.7-text-embedding-flash
LLM_EMBEDDING_BASE_URL=https://your-embedding-provider.example/v1
LLM_EMBEDDING_API_KEY=your-key
```

embedding URL/Key 未单独填写时使用 `LLM_BASE_URL` / `LLM_API_KEY`。模型名需要匹配你的 Provider。重启后自动索引 [20 张知识卡片](knowledge/README.md)；无 embedding 配置或索引失败时继续使用静态追问策略，健康接口与技术视图明确显示状态。Demo 模式不调用 Interview Agent 检索工具。

```bash
npm run eval:knowledge -- --smoke
npm run eval:knowledge:questions -- --smoke
```

应用数据默认保存在 `data/better-resume.db`，由 `DATABASE_PATH` 切换。首页“本地历史”读取数据库，清除浏览器缓存或重启后仍可打开会话；localStorage 只记住最近打开的会话。未完成会话可继续回答，已完成会话可查看报告与技术视图。默认持续保留，删除会话会一并删除回答、报告、Trace 和该会话的索引，公共知识库保留。不需要账户或登录验证码。

## Phase 4 的使用方式

填写 JD 后，创建时由 Report 模型生成岗位调查计划，逐字保留“要求”的非空行；失败时仍可开始通用面试，页面与报告会写明限制。Demo 模式不生成 Role Pack。报告中的岗位要求状态由已接受证据与深度派生，冲突优先显示；相关性映射本身不是能力证据。

报告页包含综合评价、能力雷达图、岗位匹配度、优势与待提升项、关键经历分析和能力提升路径。分析由模型按实际证据组织，每项提升任务包含引用依据、具体练习与产出、完成标准；原话与评分方法可展开查看。支持打印或保存 PDF，Markdown/JSON 下载保留相同的评分和分析。旧报告可点击“重新生成分析”，生成期间及失败后保留已有叙述。

雷达图采用可靠支持证据的最高展示深度，按 20/40/60/80/100 映射参与描述、实施细节、选择依据、取舍边界、情景迁移；未评估和冲突维度不当成零分绘制。岗位匹配度依据 JD 要求状态按 100/60/25/0 计点，必须/应有/加分要求权重为 3/2/1，仅对已调查要求加权并单列覆盖率及必须要求缺口。无 JD、无要求映射或引用校验失败时不出匹配分。这是可复算、尚未经真实招聘结果校准的规则评分，不是录用概率。

上传简历后默认只回填表单。勾选“允许在本次面试中使用简历全文”才上传提取文本，保存在会话文档表并生成 embedding。全文不直接写入 State，也不直接成为 Evidence；经当前回答核验的简历 Claim 可以保留在会话记录。删除全文索引会清除原始全文及向量，不修改已接受的面试记录。会话 JSON 导出包含 State、回答命令、Trace 和叙述报告，不含独立存储的简历全文；数据库备份包含全部本地数据。

Report / Interview Agent 都可按需 `recall` 早期回答、证据或简历，每轮各最多两次。摘要在每次 Interview Agent 决策前从 State 确定性生成，同一份用于模型输入和统计，不另行持久化；缺少 embedding 时仍可使用摘要与当前回答。时长从开始面试计时，到达设置时间只提醒，后端不会因超时终止。轮次上限可设为 5–50（默认 15，包含开放交流）。提前完成调查时先邀请候选人补充未问到的经历或反问；新经历继续追问，反问会得到回答，明确结束或达到轮次上限才关闭。每轮问答下提供可折叠的调用明细，默认展开最新轮次。 候选人明确要求换项目时立即停止当前项目；同一项目跨问题连续两次说不清、跳过或重复回答时暂停追问。未覆盖内容和未解决矛盾保留在报告中，不再强迫补齐；没有其他可展开项目时进入开放交流。

可选配置同一 Provider 的备用模型：

```dotenv
LLM_FALLBACK_MODEL=your-backup-model-id
```

主模型 Provider 重试耗尽、阶段超时或输出校验失败时启用备用模型；备用仍失败则保留原回答供重试。整个命令的截止时间仍由 `COMMAND_DEADLINE_MS` 控制，不能超过 `COMMAND_LEASE_MS`。技术视图与 `GET /api/metrics` 提供成功回答 p50/p95、样本量、Provider 错误数/请求数、超时数和备用模型采用数/尝试数。

```bash
npm run eval:phase4
```

此命令只跑一个合成 JD 和一个冻结的三项目、14 轮记忆样本；结果写入忽略提交的 `data/evaluations/phase4-smoke.json`。它验证工具链，不代表大样本质量、延迟或人工评分 Gate 已通过。

## 备份、恢复与升级

API 默认监听 `127.0.0.1:3000`，前端启动地址以 Vite 输出为准。每个数据库只运行一个 API 进程。更换 `DATABASE_PATH` 会切换所见历史；旧数据仍在原数据库文件中。

在线备份（目标必须是尚不存在的新文件）：

```bash
npm run backup -- /absolute/path/backups/interviews-2026-09-06.db
```

备份使用 SQLite backup API，包含 WAL 中已提交的数据，并执行 `integrity_check`。不要在服务运行时只复制主 `.db` 文件。

恢复时停止当前服务，把 `.env` 的 `DATABASE_PATH` 指向备份文件或它的副本，再运行 `npm run dev`。保留原数据库即可随时切回。会话 JSON 用于查阅与导出，不提供 JSON 导入；完整恢复使用数据库备份。

升级前先备份，再停止服务、更新代码（Git 用户可执行 `git pull --ff-only`）、运行 `npm install`、`npm run build`，最后启动服务。保留 `.env` 和数据库路径；启动时会补建新表，并恢复中断的回答与报告状态。

真实模型固定 Profile：

```bash
npm run eval:model -- strong
```

Phase 1.5-C 强弱模型矩阵从 `.env` 读取 `LLM_WEAK_MODEL` 和 `LLM_STRONG_MODEL`，并保持同一个 Provider：

```bash
npm run eval:routing
```

Report Agent 的同输入 frozen replay：

```bash
npm run eval:routing:report-replay
```

```bash
npm test
npm run build
```

## 目录

```text
apps/server              HTTP API + SQLite
apps/web                 React UI
packages/interview-core  Candidate Report + Evidence + deterministic guardrails
packages/pi-runtime      Interview Agent tools and model boundary
packages/api-contract    HTTP request/response schemas
roles                    legacy/evaluation role fixtures
docs/architecture        architecture contracts
```
