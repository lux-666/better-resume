# Task 4.3：Role Pack 与简历全文

[返回 Phase 4](README.md)

## 目标

把每个项目固定四个通用调查字段，升级为由岗位要求驱动生成的调查计划，使报告能给出逐条岗位要求的匹配结论；同时在候选人同意下索引简历全文，让追问和矛盾检测有更多依据。

## Role Pack

Session 创建时，若提供 JD，增加一次 `LLM_REPORT_MODEL` 调用生成 Role Pack：

```ts
interface RolePack {
  version: "role-pack-v0.1";
  requirements: Array<{
    id: string;
    text: string;                 // JD 要求原文行，逐字
    competencyId: string;         // 映射到的能力项，可新增
    priority: "must" | "should" | "nice";
    verifiableSignals: string[];  // 什么样的回答能证明它
  }>;
  competencies: RoleCompetency[]; // 通用四项 + 岗位特有项，权重和为 1
  fieldPlan: Array<{
    fieldKind: FieldKind | string; // 通用四类或岗位特有类，如 "data_governance"
    appliesToProjects: "all" | "relevant";
    importance: number;
    requirementIds: string[];
  }>;
}
```

约束：

- `requirements[].text` 必须是 JD 要求段的逐字行，校验器检查；
- 岗位特有 competency 与 fieldKind 各不超过 3 个，控制字段总数：单项目 ≤ 7 个字段，三项目 ≤ 18 个；
- 生成失败时退回通用四字段并在报告 `limitations` 写明，不阻断创建。

无 JD 时不生成 Role Pack，行为与 Phase 2 一致。

## 调查字段生成

`createCandidateReport` 按 `fieldPlan` 生成字段。每个字段带 `requirementIds`，Evidence 通过字段间接关联到要求。`validateCompletion` 中 `must` 要求对应字段进入重要字段阻塞集合。

## 项目与要求的相关性

`appliesToProjects: "relevant"` 的字段需要判断项目是否相关。Session 创建时由同一次 Role Pack 调用输出 `projectRelevance: Record<projectId, requirementId[]>`，依据是项目描述文本；这是调查计划的输入，不是能力结论，报告中标注为“根据候选人填写的项目描述判断”。

## 岗位匹配矩阵

报告 Layer 1 新增：

```ts
requirementMatrix: Array<{
  requirementId: string;
  text: string;
  priority: "must" | "should" | "nice";
  status: "supported" | "partial" | "weak" | "contradicted" | "not_investigated";
  reachedDepth?: number;
  evidenceIds: string[];
  projectIds: string[];
}>;
```

`status` 由关联字段状态与深度确定性派生：任一字段 supported 且深度 ≥ 3 为 supported；supported 但深度 < 3 为 partial；其余按最差状态。Layer 2 叙述层对每个 `must` 要求写一句结论并引用 Evidence。

综合建议四态口径不变，新增规则：任一 `must` 要求为 contradicted 时不允许 `continue_process`。

## 简历全文索引

- Intake 表单新增复选项：“允许在本次面试中使用简历全文，面试结束后可删除”；默认关闭；
- 勾选后浏览器把提取文本随 `POST /api/interviews` 一并上传，Server 分块嵌入写入 `session_chunks`，`kind: "resume"`；原文不写入 `InterviewState`，只保留 `resumeIndexed: true` 与 chunk 数；
- `recall` 工具 scope 增加 `"resume"`；Interview Agent 可引用简历片段构造问题，Report Agent 可用简历片段生成 `source: "resume"` 的 Claim，Claim 状态仍为 `unverified`；
- 新增 `DELETE /api/interviews/:id/resume-index`，页面在完成态提供按钮；
- 简历片段不能成为 Evidence `sourceQuote`。

## 评测

- 两份真实结构 JD 加对应候选人档案，人工标注期望的要求映射与 `must` 判定；
- 指标：要求逐字校验通过率、映射准确率、字段总数、创建耗时；
- 端到端：两份 JD 各完成 strong 与 weak 两次面试，检查矩阵状态与人工判断一致；
- 简历索引：勾选与不勾选两种配置对比问题的具体性，人工 Rubric。

## 验收

- Role Pack 逐字校验 100% 通过，映射准确率 ≥ 80%；
- 四次端到端面试 Critical 为 0，矩阵与人工判断一致率 ≥ 80%；
- 未勾选同意时任何接口不接收简历全文，测试覆盖；
- 删除索引后 `recall` 无简历命中，State 与报告不变。
