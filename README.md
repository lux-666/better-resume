# Better Resume

以完成 Candidate Report 为目标的证据驱动 Interview Agent。`interview-core` 保存 Report、Claim、Evidence、Competency 和确定性护栏；`pi-runtime` 让 Agent 读取 Report、提交 grounded edit、自主提问或请求结束。

## 当前可运行内容

- React / Vite 多 Project Demo 面试与实时 Candidate Report、Evidence、DecisionTrace 面板
- 姓名、技能、多项目经历表单；可选 Resume/JD 上传自动回填，原始文件不持久化
- 原生 Node HTTP API、`node:sqlite` Session 持久化、进程恢复与 Answer 租约
- 可执行 HTTP Schema、幂等 Answer Command、旧问题拒绝与 Provider 单次重试
- `read_report → edit_report → ask_candidate / finish_interview` Agent 主链
- Evidence 原话校验、重要报告字段覆盖、矛盾检查、单问题约束和 15 轮硬上限
- 客观、完整、可追溯并包含招聘建议的 Candidate Report JSON/Markdown 下载
- 面试官知识 RAG：20 张可追溯卡片、独立 embedding 配置、本地 SQLite 向量检索、知识引用与技术视图
- 强、弱、矛盾三类固定 Profile

## 文档导航

- [系统架构与能力进度](docs/architecture/README.md)

## 启动

要求 Node.js 22.19+。

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
npm run eval:knowledge
npm run eval:knowledge:questions
```

应用数据默认保存在 `data/better-resume.db`，由 `DATABASE_PATH` 切换。Session 已持久化；完整历史列表和用户删除/导出入口按 [Task 4.4](docs/phase/phase4/task-4.4-productization.md) 实现，不需要账户或登录验证码。

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
