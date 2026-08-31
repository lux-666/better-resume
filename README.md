# Better Resume

证据驱动自适应面试助手。`interview-core` 管理 Project、Topic、Claim、Evidence、Competency 和确定性 Policy；`pi-runtime` 提供受控的 Agent 与模型边界。

## 当前可运行内容

- React / Vite 多 Project 六轮 Demo 面试与实时 Topic、Gap、Evidence、DecisionTrace 面板
- 显式 Demo/LLM 运行状态、每轮模型执行 Trace 与服务端证据覆盖进度
- 原生 Node HTTP API：创建、开始、回答与状态读取
- 原生 `node:sqlite` Session 持久化、进程重启恢复与跨进程 Answer 租约
- 可执行 HTTP Schema、幂等 Answer Command、旧问题拒绝与单次 Provider 重试
- Anchor Project 与 Hierarchical Policy
- 可选的 Pi Evidence 提取、语义分类与自然问题生成主链
- 可加载的 Ownership、Metric、Failure 与 Consistency Interview Skills

## 文档导航

- [系统架构与能力进度](docs/architecture/README.md)：查看六个能力板块的当前状态、设计契约与验收门槛

## 启动

要求 Node.js 22.19+。

```bash
npm install
npm run dev
```

该命令同时启动 API（<http://127.0.0.1:3000>）和 Web（<http://localhost:5173>）。页面会明确显示 Demo 或 LLM 运行模式；单独调试时使用 `npm run dev:server` 或 `npm run dev:web`。

默认使用确定性 Demo 提取与问法。要让 Start/Answer 使用真实模型，复制 `.env.example` 为 `.env`，填写 API 配置后直接启动：

```bash
cp .env.example .env
npm run dev
```

同一配置可运行单个真实模型固定 Profile；参数可取 `strong`、`weak`、`contradictory` 或 `all`：

```bash
npm run eval:model -- strong
```

```bash
npm test
npm run build
```

## 目录

```text
apps/server              HTTP API + SQLite
apps/web                 React UI
packages/interview-core  业务状态与确定性策略
packages/pi-runtime      Pi Agent 安全适配层
packages/api-contract    HTTP 请求、响应与错误 Schema
roles                    岗位能力模型
skills                   Interview Skills（环境中的 .agents 为只读）
docs/architecture        三级系统架构文档
```

## 参考

- [Cognix AI](https://github.com/Priyansh143/Cognix-AI)：确定性状态机、选择性上下文和 SQLite 持久化
- [Beyond the Resume](https://github.com/mbzuai-nlp/beyond-the-resume)：Rubric-aware belief update 与信息获取目标
- [Pi Agent Harness](https://github.com/earendil-works/pi)：Agent Runtime、工具调用和状态管理
