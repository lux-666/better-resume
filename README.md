# Better Resume

证据驱动自适应面试助手。`interview-core` 管理 Project、Topic、Claim、Evidence、Competency 和确定性 Policy；`pi-runtime` 提供受控的 Agent 与模型边界。

## 当前可运行内容

- React / Vite 两轮 Demo 面试与实时 Topic、Gap、Evidence、DecisionTrace 面板
- 原生 Node HTTP API：创建、开始、回答与状态读取
- 原生 `node:sqlite` Session 持久化
- Anchor Project 与 Hierarchical Policy
- 只读工具白名单的 Pi Agent 入口
- `ownership-grill` Interview Skill 指令

## 文档导航

- [系统架构 Map](docs/architecture/README.md)：从系统总览进入各板块、具体契约与测试手册
- [能力建设进度](docs/architecture/capabilities/README.md)：查看 Agent、胜任力、面试策略、简历、产品与验证各方向的当前状态

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
docs/architecture        三级系统架构文档
```

## 参考

- [Cognix AI](https://github.com/Priyansh143/Cognix-AI)：确定性状态机、选择性上下文和 SQLite 持久化
- [Beyond the Resume](https://github.com/mbzuai-nlp/beyond-the-resume)：Rubric-aware belief update 与信息获取目标
- [Pi Agent Harness](https://github.com/earendil-works/pi)：Agent Runtime、工具调用和状态管理
