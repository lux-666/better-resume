# Better Resume

以完成 Candidate Report 为目标的证据驱动 Interview Agent。`interview-core` 保存 Report、Claim、Evidence、Competency 和确定性护栏；`pi-runtime` 让 Agent 读取 Report、提交 grounded edit、自主提问或请求结束。

## 当前可运行内容

- React / Vite 多 Project Demo 面试与实时 Candidate Report、Evidence、DecisionTrace 面板
- 原生 Node HTTP API、`node:sqlite` Session 持久化、进程恢复与 Answer 租约
- 可执行 HTTP Schema、幂等 Answer Command、旧问题拒绝与 Provider 单次重试
- `read_report → edit_report → ask_candidate / finish_interview` Agent 主链
- Evidence 原话校验、重要报告字段覆盖、矛盾检查、单问题约束和 15 轮硬上限
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
roles                    role competency model
docs/architecture        architecture contracts
```
