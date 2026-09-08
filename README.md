# Better Resume

以完成 Candidate Report 为目标的证据驱动 Interview Agent。`interview-core` 保存 Report、Claim、Evidence、Competency 和确定性护栏；`pi-runtime` 让 Agent 读取 Report、提交 grounded edit、自主提问或请求结束。

多项目面试、逐字 Evidence 校验、岗位要求矩阵与报告导出；支持本地历史、失败恢复、获准使用的简历全文检索，以及 338 题的公共知识检索。应用和 SQLite 在本机，真实模型调用配置的 API。

- [架构与业务契约](docs/architecture.md)
- [开发与验证](docs/development.md)
- [知识库维护与检索](knowledge/README.md)

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

模型统一配置为 low、high、mini 三档：Report 使用 low，Interview 使用 high，检索按需调用 mini；mini 初始与 low 相同：

```dotenv
LLM_WEAK_MODEL=gpt-5.6-terra
LLM_STRONG_MODEL=gpt-5.6-sol
LLM_MINI_MODEL=gpt-5.6-terra
```

可选启用面试官知识检索（应用与数据库在本机，模型仍调用配置的 API）：

```dotenv
LLM_EMBEDDING_MODEL=qwen3.7-text-embedding-flash
LLM_EMBEDDING_BASE_URL=https://your-embedding-provider.example/v1
LLM_EMBEDDING_API_KEY=your-key
```

embedding URL/Key 留空时继承 `LLM_BASE_URL` / `LLM_API_KEY`；模型名需匹配 Provider。启动自动从 `knowledge/cards.json` 更新索引，自适应决定是否调用 mini 和返回多少条。mini 留空或失败时使用本地混合检索；无 embedding 或索引失败时使用静态追问策略。健康接口与技术视图显示实际状态，Demo 不调用 Interview Agent 检索工具。

应用数据默认保存在 `data/better-resume.db`，由 `DATABASE_PATH` 切换。首页“本地历史”读取数据库，清除浏览器缓存或重启后仍可打开会话；localStorage 只记住最近打开的会话。未完成会话可继续回答，已完成会话可查看报告与技术视图。默认持续保留，删除会话会一并删除回答、报告、Trace 和该会话的索引，公共知识库保留。不需要账户或登录验证码。

## 使用

填写 JD 后，创建时由 Report 模型生成岗位调查计划，逐字保留“要求”的非空行；失败时仍可开始通用面试，页面与报告会写明限制。Demo 模式不生成 Role Pack。报告中的岗位要求状态由已接受证据与深度派生，冲突优先显示；相关性映射本身不是能力证据。

报告页包含综合评价、能力雷达图、岗位匹配度、优势与待提升项、关键经历分析和能力提升路径。分析由模型按实际证据组织，每项提升任务包含引用依据、具体练习与产出、完成标准；原话与评分方法可展开查看。支持打印或保存 PDF，Markdown/JSON 下载保留相同的评分和分析。旧报告可点击“重新生成分析”，生成期间及失败后保留已有叙述。

评分来自可复算的证据规则，未校准为录用概率；覆盖率、冲突和未评估项分别呈现，详见[报告契约](docs/architecture.md#报告)。

上传简历后默认只回填表单。勾选“允许在本次面试中使用简历全文”才上传提取文本，保存在会话文档表并生成 embedding。全文不直接写入 State，也不直接成为 Evidence；经当前回答核验的简历 Claim 可以保留在会话记录。删除全文索引会清除原始全文及向量，不修改已接受的面试记录。会话 JSON 导出包含 State、回答命令、Trace 和叙述报告，不含独立存储的简历全文；数据库备份包含全部本地数据。

Report / Interview Agent 都可按需 `recall` 早期回答、证据或简历，每轮各最多两次。摘要在每次 Interview Agent 决策前从 State 确定性生成，同一份用于模型输入和统计，不另行持久化；缺少 embedding 时仍可使用摘要与当前回答。时长从开始面试计时，到达设置时间只提醒，后端不会因超时终止。轮次上限可设为 5–50（默认 15，包含开放交流）。提前完成调查时先邀请候选人补充未问到的经历或反问；新经历继续追问，反问会得到回答，明确结束或达到轮次上限才关闭。每轮问答下提供可折叠的调用明细，默认展开最新轮次。 候选人明确要求换项目时立即停止当前项目；同一项目跨问题连续两次说不清、跳过或重复回答时暂停追问。未覆盖内容和未解决矛盾保留在报告中，不再强迫补齐；没有其他可展开项目时进入开放交流。

可选配置同一 Provider 的备用模型：

```dotenv
LLM_FALLBACK_MODEL=your-backup-model-id
```

主模型 Provider 重试耗尽、阶段超时或输出校验失败时启用备用模型；备用仍失败则保留原回答供重试。整个命令的截止时间仍由 `COMMAND_DEADLINE_MS` 控制，不能超过 `COMMAND_LEASE_MS`。技术视图与 `GET /api/metrics` 提供成功回答 p50/p95、样本量、Provider 错误数/请求数、超时数和备用模型采用数/尝试数。

## 备份、恢复与升级

API 默认监听 `127.0.0.1:3000`，前端启动地址以 Vite 输出为准。每个数据库只运行一个 API 进程。更换 `DATABASE_PATH` 会切换所见历史；旧数据仍在原数据库文件中。

在线备份（目标必须是尚不存在的新文件）：

```bash
npm run backup -- /absolute/path/backups/interviews-2026-09-06.db
```

备份使用 SQLite backup API，包含 WAL 中已提交的数据，并执行 `integrity_check`。不要在服务运行时只复制主 `.db` 文件。

恢复时停止当前服务，把 `.env` 的 `DATABASE_PATH` 指向备份文件或它的副本，再运行 `npm run dev`。保留原数据库即可随时切回。会话 JSON 用于查阅与导出，不提供 JSON 导入；完整恢复使用数据库备份。

升级前先备份，再停止服务、更新代码（Git 用户可执行 `git pull --ff-only`）、运行 `npm install`、`npm run build`，最后启动服务。保留 `.env` 和数据库路径；启动时会补建新表，并恢复中断的回答与报告状态。

开发检查与真实模型评测见[开发说明](docs/development.md)。

## 目录

```text
apps/server              HTTP API + SQLite
apps/web                 React UI
packages/interview-core  Candidate Report + Evidence + deterministic guardrails
packages/pi-runtime      Interview Agent tools and model boundary
packages/api-contract    HTTP request/response schemas
roles                    legacy/evaluation role fixtures
knowledge/cards.json     公共知识源
docs                     架构、开发与参赛材料
```
