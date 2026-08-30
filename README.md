# Better Resume

基于 Pi Agent Runtime 的证据驱动自适应面试助手骨架。Pi 管理 Agent 会话，`interview-core` 独立管理 Project、Topic、Claim、Evidence、Competency 和确定性 Policy。

## 当前可运行内容

- React / Vite 岗位与 Session 创建页
- 原生 Node HTTP API：`GET /api/health`、`GET /api/roles`、`POST /api/interviews`、`GET /api/interviews/:id/state`
- 原生 `node:sqlite` Session 持久化
- Anchor Project 与 Hierarchical Policy
- 只读工具白名单的 Pi Agent 适配入口
- 一个 `ownership-grill` Interview Skill 样板

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

下一条纵切片应当是 `resume JSON → Project/Claim → start → answer → Evidence extraction → Policy → next question`。PDF 解析、RAG、报告和更多岗位在这条链跑通后再加。

## 参考

- [Cognix AI](https://github.com/Priyansh143/Cognix-AI)：确定性状态机、选择性上下文和 SQLite 持久化
- [Beyond the Resume](https://github.com/mbzuai-nlp/beyond-the-resume)：Rubric-aware belief update 与信息获取目标
- [Pi Agent Harness](https://github.com/earendil-works/pi)：Agent Runtime、工具调用和状态管理
