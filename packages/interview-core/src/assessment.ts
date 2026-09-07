import { Type, type Static } from "typebox";
import type { InterviewState } from "./types.ts";
import type { RequirementMatrix } from "./phase4-schema.ts";

const score = () => Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]);
export const AssessmentSchema = Type.Object({
  version: Type.Literal("competency-assessment-v1"),
  coveragePercent: Type.Integer({ minimum: 0, maximum: 100 }),
  answeredQuestions: Type.Integer({ minimum: 0 }),
  investigatedProjects: Type.Integer({ minimum: 0 }),
  dimensions: Type.Array(Type.Object({
    competencyId: Type.String(), name: Type.String(), score: score(), weight: Type.Number(),
    confidence: Type.Number({ minimum: 0, maximum: 1 }), evidenceIds: Type.Array(Type.String()),
    level: Type.String(), status: Type.Union([Type.Literal("demonstrated"), Type.Literal("limited"), Type.Literal("conflicting"), Type.Literal("unassessed")]),
  }, { additionalProperties: false })),
  match: Type.Object({ score: score(), coveragePercent: Type.Integer({ minimum: 0, maximum: 100 }),
    status: Type.Union([Type.Literal("unavailable"), Type.Literal("provisional"), Type.Literal("assessed")]),
    explanation: Type.String(), blockers: Type.Array(Type.String()),
  }, { additionalProperties: false }),
  methodology: Type.Array(Type.String()),
}, { additionalProperties: false });
export type CompetencyAssessment = Static<typeof AssessmentSchema>;
const depthLabels = ["未验证", "说明参与", "重建实施细节", "解释选择依据", "分析取舍与边界", "迁移到新情景"];

export function buildAssessment(state: InterviewState, matrix: RequirementMatrix, valid: boolean): CompetencyAssessment {
  const fields = state.report.fields;
  const dimensions: CompetencyAssessment["dimensions"] = state.role.competencies.map((competency) => {
    const related = fields.filter((field) => field.competencyId === competency.id);
    const evidenceIds = [...new Set(related.flatMap((field) => field.evidenceIds))];
    const evidence = state.evidence.filter((item) => evidenceIds.includes(item.id));
    const conflicting = related.some((field) => field.status === "contradicted");
    const supported = evidence.filter((item) => item.polarity === "support" && item.strength * item.specificity >= .45
      && related.some((field) => field.status === "supported" && item.reportFieldIds.includes(field.id)));
    const depth = Math.max(0, ...supported.map((item) => item.depthLevel ?? 0));
    return { competencyId: competency.id, name: competency.name, weight: competency.weight,
      score: valid && !conflicting && depth > 0 ? depth * 20 : null,
      confidence: evidence.length ? Math.round(evidence.reduce((sum, item) => sum + item.evaluatorConfidence * item.specificity, 0) / evidence.length * 100) / 100 : 0,
      evidenceIds, level: !valid ? "引用校验未通过" : conflicting ? "陈述存在冲突" : depth ? depthLabels[depth] : evidence.length ? "尚未展示可靠深度" : "尚未调查",
      status: !valid || !evidence.length ? "unassessed" : conflicting ? "conflicting" : depth ? "demonstrated" : "limited" };
  });
  // ponytail: rule-based requirement points; calibrate against expert ratings when labeled interview outcomes exist.
  const points = { supported: 100, partial: 60, weak: 25, contradicted: 0 };
  const weights = { must: 3, should: 2, nice: 1 };
  const observed = matrix.filter((row) => row.status !== "not_investigated");
  const totalWeight = matrix.reduce((sum, row) => sum + weights[row.priority], 0);
  const observedWeight = observed.reduce((sum, row) => sum + weights[row.priority], 0);
  const coverage = totalWeight ? Math.round(observedWeight / totalWeight * 100) : 0;
  const matchScore = valid && state.role.source === "job_description" && observedWeight
    ? Math.round(observed.reduce((sum, row) => sum + points[row.status as keyof typeof points] * weights[row.priority], 0) / observedWeight) : null;
  const blockers = matrix.filter((row) => row.priority === "must" && row.status !== "supported").map((row) => row.text);
  return { version: "competency-assessment-v1", dimensions,
    coveragePercent: fields.length ? Math.round(fields.filter((field) => field.evidenceIds.length > 0).length / fields.length * 100) : 0,
    answeredQuestions: state.turns.filter((turn) => turn.kind !== "supplement").length,
    investigatedProjects: new Set(state.turns.map((turn) => turn.projectId).filter(Boolean)).size,
    match: { score: matchScore, coveragePercent: coverage,
      status: matchScore === null ? "unavailable" : observed.length === matrix.length && state.status === "completed" ? "assessed" : "provisional",
      explanation: !valid ? "引用完整性校验未通过，暂不出分。" : state.role.source !== "job_description" ? "未提供目标岗位 JD；完成岗位要求映射后才能计算匹配度。"
        : !matrix.length ? "JD 尚未建立逐条要求映射，暂不计算岗位匹配度。" : !observedWeight ? "岗位要求尚未调查，暂不计算匹配度。"
        : `按已调查的 ${observed.length}/${matrix.length} 条岗位要求计算${observed.length < matrix.length ? "，属于暂定分；未调查要求不按零分处理" : ""}。`, blockers },
    methodology: [
      "能力雷达图按可靠支持证据的最高展示深度计分：说明参与 20、实施细节 40、选择依据 60、取舍边界 80、情景迁移 100。它描述本次已展示表现，不代表能力上限。",
      "仅采用强度×具体性不低于 0.45 且对应调查项为支持状态的证据；无深度标注、无可靠支持或存在冲突时不出能力分，不画成零分。",
      "岗位匹配度按已调查要求加权：有支持 100、部分支持 60、证据偏弱 25、冲突 0；必须/应有/加分要求权重为 3/2/1。调查覆盖率单独呈现，必须要求的缺口单独列出。",
      "这是可复算的规则评分，尚未用真实招聘结果校准；不代表录用概率或行业排名。分数由程序计算，模型仅撰写有引用的分析。",
    ] };
}
