# Task 4.3：Role Pack 与简历全文

[返回 Phase 4](README.md)

## 目标

把每个项目固定四个通用调查字段，升级为由岗位要求驱动生成的调查计划，使报告能给出逐条岗位要求的匹配结论；同时在候选人同意下索引简历全文，让追问和矛盾检测有更多依据。

## 当前交付状态

MVP 已接入创建、Agent、报告 JSON/Markdown、页面和删除索引接口。真实模型一份合成 JD 冒烟通过；多 JD/人工映射准确率 Gate 待后续。

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
    competencyId: string;        // 与要求的 competencyId 一致
    name: string;
    fieldKind: FieldKind | string; // 通用四类或岗位特有类，如 "data_governance"
    appliesToProjects: "all" | "relevant";
    importance: number;
    requirementIds: string[];
  }>;
}
```

约束：

- `requirements[].text` 必须完整覆盖 JD 要求段的逐字非空行（去首尾空白、完全重复行去重），不允许改写、漏行或编造；通用四字段的能力映射保持不变；
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

`status` 由关联字段状态与深度确定性派生：任一字段 contradicted 时优先标为 contradicted，避免跨项目冲突被支持证据覆盖；无冲突时，任一字段 supported 且深度 ≥3 为 supported；仅浅层支持为 partial；然后依次为 weak、not_investigated。Layer 2 对每条 must 输出与矩阵一致的 status 和一句结论，引用仅限该要求关联 Evidence；无证据只能使用固定的“无法形成能力结论”句。

综合建议四态口径不变，新增规则：任一 `must` 要求为 contradicted 时不允许 `continue_process`。

## 简历全文索引

- Intake 表单新增复选项：“允许在本次面试中使用简历全文，面试结束后可删除”；默认关闭；
- 勾选后浏览器把提取文本随 `POST /api/interviews` 一并上传，Server 以 1100 字符窗口、1000 字符步长分块，正文在 `session_documents`，向量在 `session_chunks` 的 `kind: "resume"`；全文不直接写入 `InterviewState`，响应返回 `resumeIndexed` 与 chunk 数；
- `recall` 工具 scope 增加 `"resume"`；Interview Agent 可引用简历片段构造问题，Report Agent 可用简历片段生成 `source: "resume"` 的 Claim，Claim 状态仍为 `unverified`；
- 新增 `DELETE /api/interviews/:id/resume-index`，页面在有简历文档时提供按钮；正在处理回答时返回可重试冲突；
- 删除全文与向量不修改已接受的 Claim/Evidence/State，历史上经回答核验的简历 Claim 仍属于面试记录；
- 简历片段不能成为 Evidence `sourceQuote`，除非同样的文字真实出现在当前回答中；
- 创建中断时持久化草稿标记未完成；没有成功的向量缓存不报告索引已就绪。

## 运行观测

创建阶段的 Role Pack、查询嵌入和简历索引接入统一 Trace/Span，记录耗时、结果、降级与来源版本；原始简历不进入遥测。当前创建页显示“正在创建调查计划与索引”，创建结束后可在技术视图读取详细 Trace；创建过程尚无分阶段实时流。

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

## 本轮验证

- 自动化覆盖逐字完整映射、重复/编造引用、字段约束、冻结、must 完成阻塞、冲突矩阵、叙述引用、简历 opt-in/删除/晚到响应与原话保护。
- 真实合成 JD：3 条原文要求、三项目共 12 个调查字段，生成与校验通过。
- 两份真实 JD、四次完整面试与人工映射/矩阵准确率尚未评测。
