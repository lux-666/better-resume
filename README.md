# Better Resume

证据驱动自适应面试助手骨架。`interview-core` 独立管理 Project、Topic、Claim、Evidence、Competency 和确定性 Policy；Pi 目前只是经过类型验证的实验性适配入口，尚未接管 Session、Skill Loading 或 Compaction。

## 当前可运行内容

- React / Vite 两轮 Demo 面试与实时 Evidence 面板
- 原生 Node HTTP API：创建、开始、回答与状态读取
- 原生 `node:sqlite` Session 持久化
- Anchor Project 与 Hierarchical Policy
- 只读工具白名单的 Pi Agent 适配入口（未接入 HTTP 流程）
- 一个 `ownership-grill` Interview Skill 样板

## 当前阶段

- ✅ 数据模型、Anchor Project、Policy 骨架
- ✅ HTTP / SQLite Session 骨架
- ✅ Pi 只读适配实验
- ✅ Answer → Evidence → Competency → Gap → Next Question（确定性 Demo 提取器）
- ❌ Resume Parsing、完整 Skill Loading、RAG、Report

当前工作范围与验收条件见 [docs/01-mvp.md](docs/01-mvp.md)，架构审阅的逐条答复见 [docs/architecture-review-response.md](docs/architecture-review-response.md)。

## 启动

要求 Node.js 22.19+。

```bash
npm install
npm run dev
```

另开终端启动 Web：

```bash
npm run dev:web
```

访问 <http://localhost:5173>。

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
roles                    岗位能力模型
skills                   Interview Skills（环境中的 .agents 为只读）
docs                     技术设计
```

下一步只替换一个点：把确定性 Demo Evidence 提取器换成 Pi 的结构化模型输出。PDF 解析、RAG、报告和更多岗位继续暂缓。

## 参考

- [Cognix AI](https://github.com/Priyansh143/Cognix-AI)：确定性状态机、选择性上下文和 SQLite 持久化
- [Beyond the Resume](https://github.com/mbzuai-nlp/beyond-the-resume)：Rubric-aware belief update 与信息获取目标
- [Pi Agent Harness](https://github.com/earendil-works/pi)：Agent Runtime、工具调用和状态管理
