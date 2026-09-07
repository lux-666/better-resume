import { buildAssessment, type CompetencyAssessment } from "./assessment.ts";
import { requirementMatrix } from "./role-pack.ts";
import type { RequirementMatrix } from "./phase4-schema.ts";
import { fieldConclusion, projectLeads, interviewTurnLimit, answerTurnCount, projectPauseReason } from "./investigation.ts";
import type { DepthLevel } from "./types.ts";
import type { ReportNarrative, NarrativeStatus, NarrativeSentence } from "./narrative-schema.ts";
import type {
  Evidence,
  InterviewState,
  ReportField,
} from "./index.ts";

interface CandidateReportEvidenceReference {
  depthLevel?: DepthLevel;
  evidenceId: string;
  turnId: string;
  question: string;
  answerQuote: string;
  statement: string;
  polarity: Evidence["polarity"];
  strength: number;
  specificity: number;
  evaluatorConfidence: number;
}

interface CandidateReportFieldOutput {
  detail: ReturnType<typeof fieldConclusion>;
  fieldId: string;
  name: string;
  description: string;
  status: ReportField["status"];
  conclusion: string;
  evidence: CandidateReportEvidenceReference[];
  recommendation?: string;
}

interface CandidateReportFinding {
  projectId: string;
  projectName: string;
  fieldId: string;
  fieldName: string;
  status: ReportField["status"];
  conclusion: string;
  evidenceIds: string[];
}

interface CandidateReportGap {
  projectId: string;
  projectName: string;
  fieldId: string;
  fieldName: string;
  reason: string;
  recommendedAction: string;
}

export interface CandidateReportArtifact {
  assessment?: CompetencyAssessment;
  requirementMatrix?: RequirementMatrix;
  leads: ReturnType<typeof projectLeads>;
  competencies: Array<{ competencyId: string; name: string; evidenceStrengthIndex: number | null; confidence: number; evidenceIds: string[];
    statusCounts: Record<ReportField["status"], number>; reachedDepth?: DepthLevel }>;
  narrativeStatus?: NarrativeStatus;
  narrativeSourceVersion?: number;
  narrative?: ReportNarrative;
  schemaVersion: "candidate-report-v0.1";
  sessionId: string;
  generatedAt: string;
  status: "in_progress" | "complete";
  candidate: { name: string; skills: string[] };
  role: {
    name: string;
    source: InterviewState["role"]["source"];
    description: string;
    requirements: string[];
  };
  executiveSummary: {
    recommendation: "insufficient_evidence" | "continue_process" | "continue_with_verification" | "hold_for_clarification";
    assessment: string;
    rationale: string[];
    strengths: CandidateReportFinding[];
    concerns: CandidateReportFinding[];
    evidenceGaps: CandidateReportGap[];
    nextSteps: string[];
  };
  summary: {
    supported: number;
    weak: number;
    contradicted: number;
    missing: number;
    openContradictions: number;
  };
  projects: Array<{
    projectId: string;
    name: string;
    candidateInput: string;
    fields: CandidateReportFieldOutput[];
  }>;
  contradictions: Array<{
    contradictionId: string;
    projectName?: string;
    claim: string;
    status: "open" | "resolved";
    evidenceIds: string[];
    resolutionEvidenceIds: string[];
  }>;
  evaluationBasis: string[];
  limitations: string[];
  integrity: { valid: boolean; errors: string[] };
}

export interface InterviewReportBundle {
  report: CandidateReportArtifact;
  markdown: string;
}

function recommendation(field: ReportField, projectName: string, hasOpenContradiction: boolean): string | undefined {
  if (field.status === "missing") return `补充核验“${projectName}”的“${field.name}”，要求候选人给出一个具体事实、个人动作和可验证结果。`;
  if (field.status === "weak") return `进一步核实“${projectName}”的“${field.name}”，重点补充个人边界、判断依据和可复核细节。`;
  if (field.status === "contradicted") return hasOpenContradiction
    ? `在作出招聘判断前澄清“${projectName}”的“${field.name}”，逐项核对冲突说法及其时间、范围和结果。`
    : `复核“${projectName}”的“${field.name}”更正结果，把已确认的实际贡献与原始候选人输入分开记录。`;
}

function conclusion(field: ReportField, state: InterviewState): string {
  const detail = fieldConclusion(state, field.id);
  const statements = [...detail.supportStatements.map((text) => `支持：${text}`), ...detail.weaknessStatements.map((text) => `待核实：${text}`), ...detail.invalidateStatements.map((text) => `更正或冲突：${text}`)];
  if (detail.reachedDepth) statements.push(`已展示到第 ${detail.reachedDepth} 层`);
  if (detail.boundaryReason) statements.push(`第 ${detail.boundaryReason.depthLevel} 层尚未展开，不能据此推断能力上限`);
  if (statements.length) return statements.join("；");
  if (field.status === "missing") return "尚未获得足够信息，不能形成正面或负面能力结论。";
  if (field.status === "weak") return "已有相关回答，但具体性、可验证性或可信度不足。";
  if (field.status === "contradicted") return "候选人回答与已有信息存在冲突，尚未形成稳定结论。";
  return "已有候选人回答提供支持，但未生成额外总结。";
}

function validateReportIntegrity(state: InterviewState): string[] {
  const errors: string[] = [];
  const fields = new Map(state.report.fields.map((field) => [field.id, field]));
  const turns = new Map(state.turns.map((turn) => [turn.id, turn]));
  const evidence = new Map(state.evidence.map((item) => [item.id, item]));
  for (const field of state.report.fields) {
    if (field.status !== "missing" && field.evidenceIds.length === 0) {
      errors.push(`${field.id}: non-missing field has no evidence`);
    }
    for (const evidenceId of field.evidenceIds) {
      const item = evidence.get(evidenceId);
      if (!item) {
        errors.push(`${field.id}: missing evidence ${evidenceId}`);
        continue;
      }
      if (!item.reportFieldIds.includes(field.id)) errors.push(`${evidenceId}: does not reference ${field.id}`);
      if (item.projectId && item.projectId !== field.projectId) errors.push(`${evidenceId}: project mismatch`);
      const turn = turns.get(item.turnId);
      if (!turn) errors.push(`${evidenceId}: missing turn ${item.turnId}`);
      else if (!turn.answer.includes(item.sourceQuote)) errors.push(`${evidenceId}: source quote is not in the answer`);
    }
  }
  for (const item of state.evidence) {
    for (const fieldId of item.reportFieldIds) {
      if (!fields.has(fieldId)) errors.push(`${item.id}: unknown report field ${fieldId}`);
    }
  }
  for (const contradiction of state.report.contradictions) {
    for (const evidenceId of [...contradiction.evidenceIds, ...contradiction.resolutionEvidenceIds]) {
      if (!evidence.has(evidenceId)) errors.push(`${contradiction.id}: missing evidence ${evidenceId}`);
    }
  }
  return [...new Set(errors)];
}

function finding(
  project: { projectId: string; name: string },
  field: CandidateReportFieldOutput,
): CandidateReportFinding {
  return {
    projectId: project.projectId,
    projectName: project.name,
    fieldId: field.fieldId,
    fieldName: field.name,
    status: field.status,
    conclusion: field.conclusion,
    evidenceIds: field.evidence.map((item) => item.evidenceId),
  };
}

function reportRecommendation(summary: CandidateReportArtifact["summary"]): CandidateReportArtifact["executiveSummary"]["recommendation"] {
  if (summary.openContradictions > 0) return "hold_for_clarification";
  if (summary.supported === 0) return "insufficient_evidence";
  if (summary.missing > 0 || summary.weak > 0 || summary.contradicted > 0) return "continue_with_verification";
  return "continue_process";
}

function assessment(
  recommendationValue: CandidateReportArtifact["executiveSummary"]["recommendation"],
  summary: CandidateReportArtifact["summary"],
): string {
  if (recommendationValue === "hold_for_clarification") {
    return `当前存在 ${summary.openContradictions || summary.contradicted} 个需要澄清的冲突，现有证据不足以支持稳定的招聘判断。`;
  }
  if (recommendationValue === "insufficient_evidence") {
    return "当前没有任何调查维度达到有充分证据支持的状态，不应据此对候选人能力作正面或负面判断。";
  }
  if (recommendationValue === "continue_with_verification") {
    return `已有 ${summary.supported} 个维度获得支持，但仍有 ${summary.weak + summary.missing} 个维度证据不足、${summary.contradicted} 个维度与候选人输入不一致，建议继续流程并定向核验。`;
  }
  return `当前 ${summary.supported} 个调查维度均形成了可追溯支持，未发现未决矛盾，可进入下一招聘环节。`;
}

export function buildCandidateReportArtifact(
  state: InterviewState,
  generatedAt = new Date().toISOString(),
): CandidateReportArtifact {
  const turns = new Map(state.turns.map((turn) => [turn.id, turn]));
  const evidence = new Map(state.evidence.map((item) => [item.id, item]));
  const projects = state.candidate.projects.map((project) => ({
    projectId: project.id,
    name: project.name,
    candidateInput: project.description,
    fields: state.report.fields.filter((field) => field.projectId === project.id).map((field): CandidateReportFieldOutput => {
      const nextRecommendation = recommendation(field, project.name, state.report.contradictions.some((item) =>
        item.projectId === project.id && item.status === "open"));
      return {
        fieldId: field.id,
        name: field.name,
        description: field.description,
        status: field.status,
        conclusion: conclusion(field, state),
        detail: fieldConclusion(state, field.id),
        evidence: field.evidenceIds.flatMap((evidenceId) => {
          const item = evidence.get(evidenceId);
          const turn = item && turns.get(item.turnId);
          return item && turn ? [{
            evidenceId: item.id,
            turnId: turn.id,
            question: turn.question,
            answerQuote: item.sourceQuote,
            statement: item.statement,
            polarity: item.polarity,
            strength: item.strength,
            specificity: item.specificity,
            evaluatorConfidence: item.evaluatorConfidence,
            depthLevel: item.depthLevel,
          }] : [];
        }),
        ...(nextRecommendation ? { recommendation: nextRecommendation } : {}),
      };
    }),
  }));
  const summary = {
    supported: state.report.fields.filter((field) => field.status === "supported").length,
    weak: state.report.fields.filter((field) => field.status === "weak").length,
    contradicted: state.report.fields.filter((field) => field.status === "contradicted").length,
    missing: state.report.fields.filter((field) => field.status === "missing").length,
    openContradictions: state.report.contradictions.filter((item) => item.status === "open").length,
  };
  const strengths = projects.flatMap((project) => project.fields
    .filter((field) => field.status === "supported")
    .map((field) => finding(project, field)));
  const concerns = projects.flatMap((project) => project.fields
    .filter((field) => field.status === "weak" || field.status === "contradicted")
    .map((field) => finding(project, field)));
  const evidenceGaps = projects.flatMap((project) => project.fields
    .filter((field) => field.status === "missing")
    .map((field): CandidateReportGap => ({
      projectId: project.projectId,
      projectName: project.name,
      fieldId: field.fieldId,
      fieldName: field.name,
      reason: field.conclusion,
      recommendedAction: field.recommendation!,
    })));
  const nextSteps = projects.flatMap((project) => project.fields.flatMap((field) =>
    field.recommendation ? [field.recommendation] : []));
  if (nextSteps.length === 0) nextSteps.push("进入下一招聘环节，并结合岗位要求对关键结论做抽样复核。");
  const matrix = requirementMatrix(state);
  const recommendationValue = matrix.some((r) => r.priority === "must" && r.status === "contradicted") ? "hold_for_clarification" : reportRecommendation(summary);
  const integrityErrors = validateReportIntegrity(state);
  return {
    assessment: buildAssessment(state, matrix, integrityErrors.length === 0),
    ...(state.rolePack ? { requirementMatrix: matrix } : {}),
    leads: projectLeads(state),
    competencies: state.role.competencies.map((competency) => {
      const fields = state.report.fields.filter((field) => field.competencyId === competency.id);
      const current = state.competencies.find((item) => item.competencyId === competency.id);
      const depths = fields.flatMap((field) => fieldConclusion(state, field.id).reachedDepth ?? []);
      return { competencyId: competency.id, name: competency.name, evidenceStrengthIndex: current?.score ?? null, confidence: current?.confidence ?? 0,
        evidenceIds: current?.evidenceIds ?? [], statusCounts: { supported: fields.filter((field) => field.status === "supported").length,
          weak: fields.filter((field) => field.status === "weak").length, contradicted: fields.filter((field) => field.status === "contradicted").length,
          missing: fields.filter((field) => field.status === "missing").length }, reachedDepth: depths.length ? Math.max(...depths) as DepthLevel : undefined };
    }),
    schemaVersion: "candidate-report-v0.1",
    sessionId: state.sessionId,
    generatedAt,
    status: state.report.status,
    candidate: { name: state.candidate.name, skills: [...state.candidate.skills] },
    role: {
      name: state.role.name,
      source: state.role.source,
      description: state.role.description,
      requirements: [...state.role.requirements],
    },
    executiveSummary: {
      recommendation: recommendationValue,
      assessment: assessment(recommendationValue, summary),
      rationale: [
        `${summary.supported}/${state.report.fields.length} 个调查维度获得充分支持。`,
        `${summary.weak} 个维度证据偏弱，${summary.missing} 个维度尚无足够信息。`,
        `${summary.contradicted} 个维度存在冲突，${summary.openContradictions} 个矛盾尚未解决。`,
      ],
      strengths,
      concerns,
      evidenceGaps,
      nextSteps,
    },
    summary,
    projects,
    contradictions: state.report.contradictions.map((item) => ({
      contradictionId: item.id,
      projectName: state.candidate.projects.find((project) => project.id === item.projectId)?.name,
      claim: [...state.candidate.projects.flatMap((project) => project.claims), ...state.candidate.claims]
        .find((claim) => claim.id === item.claimId)?.text ?? item.claimId,
      status: item.status,
      evidenceIds: [...item.evidenceIds],
      resolutionEvidenceIds: [...item.resolutionEvidenceIds],
    })),
    evaluationBasis: [
      "只把候选人回答中可以逐字定位的内容作为能力证据。",
      "候选人填写的技能和项目经历是待核验输入，不自动视为已证明能力。",
      "缺少信息标记为 missing，不把未回答或未覆盖直接解释为能力不足。",
      "证据不足、证据冲突和证据支持分别呈现，不用单一总分掩盖差异。",
    ],
    limitations: [
      ...state.candidate.projects.flatMap((project) => {
        const reason = projectPauseReason(state, project.id);
        return reason ? [`“${project.name}”：${reason} 未展开内容保留为待核实，不据此判定能力不足。`] : [];
      }),
      ...(state.status === "completed" && summary.missing > 0 ? [answerTurnCount(state) >= interviewTurnLimit(state) ? "本次达到问题数量上限后结束，以下未覆盖内容尚未完成调查。" : "部分话题经跳过或重复追问后停止，未获得信息不代表能力不足。"] : []),
      ...(state.role.source === "generic" ? ["未提供 Job Description，本报告不能形成具体岗位匹配结论。"] : []),
      ...(state.rolePack ? ["岗位要求映射和项目相关性根据 JD 与候选人填写的项目描述生成，调查计划本身不是能力证据。"] : [state.rolePackFailure ?? "当前报告使用跨岗位通用调查维度，不等价于对每条岗位要求逐项验证。"]),
      ...(state.resumeIndexFailure ? [state.resumeIndexFailure] : []),
      "招聘建议只基于本次面试获得的证据，不包含背调、作品核验或其他招聘环节信息。",
    ],
    integrity: { valid: integrityErrors.length === 0, errors: integrityErrors },
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+.!|>-])/g, "\\$1");
}

export function reportInsights(report: Pick<CandidateReportArtifact, "narrative" | "executiveSummary">): NonNullable<ReportNarrative["insights"]> {
  if (report.narrative?.insights) return report.narrative.insights;
  const seen = new Set<string>();
  return [...report.executiveSummary.strengths, ...report.executiveSummary.concerns].filter((item) => {
    const key = `${item.status}:${item.fieldName}`;
    if (!item.evidenceIds.length || seen.has(key)) return false;
    seen.add(key); return true;
  }).map((item) => ({ kind: item.status === "supported" ? "strength" : item.status === "contradicted" ? "risk" : "development",
    title: `${item.projectName} · ${item.fieldName}`, explanation: { text: item.conclusion, evidenceIds: item.evidenceIds } }));
}

export function reportImprovementPlan(report: Pick<CandidateReportArtifact, "narrative" | "executiveSummary">): NonNullable<ReportNarrative["improvementPlan"]> {
  if (report.narrative?.improvementPlan) return report.narrative.improvementPlan;
  const tasks: Record<string, [string, string]> = {
    ownership: ["画出交付流程并标注自己与同事的职责；挑选个人决策，附上实现或交付记录。", "能明确区分个人动作和团队成果，并沿原始记录解释一次完整交付。"],
    mechanism: ["复现项目中的关键方案，对比一个替代方案，记录选择依据和失效条件。", "能用复现结果说明取舍，并解释业务约束改变时如何调整方案。"],
    measurement: ["整理固定样本、指标定义和对照基线，完成一份可复跑的结果验证记录。", "他人可以按相同步骤复核结果，记录能说明样本偏差和结论适用范围。"],
    failure: ["重建一次问题排查的时间线，写明现象、假设、定位依据、修复和回归步骤。", "能够复现问题与修复效果，并用回归检查验证根因判断。"],
  };
  const findings = report.executiveSummary.concerns.length ? report.executiveSummary.concerns : report.executiveSummary.strengths;
  const seen = new Set<string>();
  return findings.filter((item) => {
    if (!item.evidenceIds.length || seen.has(item.fieldName)) return false;
    seen.add(item.fieldName); return true;
  }).slice(0, 3).map((item, index) => {
    const [action, acceptance] = tasks[item.fieldId.split(":").at(-1)!] ?? ["围绕已讨论的实现整理可复现案例，写明实际动作、选择依据和结果。", "他人能够复现案例，并核对个人贡献与结论依据。"];
    return { title: `${item.projectName}：${item.fieldName}`, priority: index === 0 ? "first" : "next",
      rationale: { text: `围绕“${item.projectName}”中已讨论的“${item.fieldName}”，把口头说明转成可复核的材料。`, evidenceIds: item.evidenceIds }, action, acceptance };
  });
}

export function reportSections(report: Pick<CandidateReportArtifact, "narrative"> & { projects: Array<{ projectId: string; name: string; fields: Array<{ evidence: Array<{ statement: string; evidenceId: string }> }> }>; competencies: Array<{ competencyId: string; name: string }> }): Array<{ title: string; paragraphs: NarrativeSentence[] }> {
  const narrative = report.narrative;
  const sections = narrative ? [
    { title: "综合判断", paragraphs: narrative.overall },
    ...(narrative.sections ?? []),
    ...(narrative.insights ? [] : narrative.projects.map((item) => ({ title: report.projects.find((project) => project.projectId === item.projectId)?.name ?? item.projectId, paragraphs: item.summary }))),
    ...(narrative.insights ? [] : narrative.competencies.map((item) => ({ title: report.competencies.find((competency) => competency.competencyId === item.competencyId)?.name ?? item.competencyId, paragraphs: [...item.boundary, ...item.highlights] }))),
    { title: "招聘方下一步建议", paragraphs: narrative.recruiterNextSteps },
    { title: "候选人反馈", paragraphs: narrative.candidateFeedback },
  ] : report.projects.map((project) => ({ title: project.name, paragraphs: project.fields.flatMap((field) =>
    field.evidence.map((item) => ({ text: item.statement, evidenceIds: [item.evidenceId] }))) }));
  const seen = new Map<string, NarrativeSentence>();
  return sections.map((section) => ({ ...section, paragraphs: section.paragraphs.flatMap((item) => {
    if (!item.evidenceIds.length) return [];
    const key = item.text.trim(); const previous = seen.get(key);
    if (previous) { previous.evidenceIds = [...new Set([...previous.evidenceIds, ...item.evidenceIds])]; return []; }
    const sentence = { text: item.text, evidenceIds: [...item.evidenceIds] };
    seen.set(key, sentence); return [sentence];
  }) })).filter((section) => section.paragraphs.length > 0);
}

export function reportEvidence(report: { projects: Array<{ fields: Array<{ evidence: Array<{ turnId: string; answerQuote: string; question: string; evidenceId: string }> }> }> }) {
  const quotes = new Map<string, { question: string; answerQuote: string; evidenceIds: string[] }>();
  for (const item of report.projects.flatMap((project) => project.fields.flatMap((field) => field.evidence))) {
    const key = `${item.turnId}:${item.answerQuote}`;
    const quote = quotes.get(key) ?? { question: item.question, answerQuote: item.answerQuote, evidenceIds: [] };
    if (!quote.evidenceIds.includes(item.evidenceId)) quote.evidenceIds.push(item.evidenceId);
    quotes.set(key, quote);
  }
  return [...quotes.values()];
}

export function renderInterviewReportMarkdown(report: CandidateReportArtifact): string {
  const lines = [`# 候选人评估报告：${escapeMarkdown(report.candidate.name)}`, "",
    `- 目标岗位：${escapeMarkdown(report.role.name)}`, `- 报告状态：${report.status}`, `- 生成时间：${report.generatedAt}`, ""];
  if (report.assessment) {
    const { match, dimensions, methodology } = report.assessment;
    lines.push("## 岗位匹配度评分", "", `**${match.score === null ? "暂不出分" : `${match.score} / 100${match.status === "provisional" ? "（暂定）" : ""}`}** · 岗位要求覆盖率 ${match.coveragePercent}%`, "", escapeMarkdown(match.explanation), "");
    if (match.blockers.length) lines.push("必须要求仍需核验：", ...match.blockers.map((text) => `- ${escapeMarkdown(text)}`), "");
    lines.push("## 能力画像", "", "| 能力 | 本次展示深度分 | 展示边界 |", "| --- | --- | --- |");
    for (const dimension of dimensions) lines.push(`| ${escapeMarkdown(dimension.name)} | ${dimension.score ?? "未评估"} | ${escapeMarkdown(dimension.level)} |`);
    lines.push("", "雷达图见报告页面及打印版；未评估维度不按零分绘制。", "", "### 评分方法", "", ...methodology.map((text) => `- ${escapeMarkdown(text)}`), "");
  }
  const sections = report.narrative ? reportSections(report) : [];
  if (!sections.length && !reportEvidence(report).length) lines.push("本次尚无可引用的回答，请完成面试后查看报告。", "");
  for (const section of sections) {
    lines.push(`## ${escapeMarkdown(section.title)}`, "");
    for (const item of section.paragraphs) lines.push(`${escapeMarkdown(item.text)} [Evidence: ${item.evidenceIds.join(", ")}]`, "");
  }
  const insights = reportInsights(report);
  if (insights.length) {
    lines.push("## 优势与劣势分析", "");
    for (const insight of insights) lines.push(`### ${insight.kind === "strength" ? "优势" : insight.kind === "risk" ? "需核验" : "待提升"} · ${escapeMarkdown(insight.title)}`, "", `${escapeMarkdown(insight.explanation.text)} [Evidence: ${insight.explanation.evidenceIds.join(", ")}]`, "");
  }
  const plan = reportImprovementPlan(report);
  if (plan.length) {
    lines.push("## 能力提升路径", "");
    for (const [index, item] of plan.entries()) lines.push(`### ${index + 1}. ${escapeMarkdown(item.title)}`, "", `优先级：${{ first: "优先完成", next: "随后推进", stretch: "进阶挑战" }[item.priority]}`, "",
      `依据：${escapeMarkdown(item.rationale.text)} [Evidence: ${item.rationale.evidenceIds.join(", ")}]`, "", `练习与产出：${escapeMarkdown(item.action)}`, "", `完成标准：${escapeMarkdown(item.acceptance)}`, "");
  }
  if (report.requirementMatrix?.length) {
    lines.push("## 岗位要求匹配", "");
    for (const row of report.requirementMatrix) {
      const sentence = report.narrative?.requirements?.find((item) => item.requirementId === row.requirementId)?.conclusion;
      lines.push(`- ${escapeMarkdown(row.text)}：${row.status}${sentence?.evidenceIds.length ? `；${escapeMarkdown(sentence.text)} [Evidence: ${sentence.evidenceIds.join(", ")}]` : ""}`);
    }
    lines.push("");
  }
  const gaps = report.projects.map((project) => ({ name: project.name, fields: project.fields.filter((field) => field.status === "missing").map((field) => field.name) })).filter((project) => project.fields.length);
  if (gaps.length) lines.push("## 调查范围与未覆盖内容", "", "以下内容尚未取得可引用回答，不作能力结论。", "",
    ...gaps.map((project) => `- ${escapeMarkdown(project.name)}：${project.fields.map(escapeMarkdown).join("、")}`), "");
  const leads = [...new Set(report.leads.filter((item) => item.status === "dropped").map((item) => item.text))];
  if (leads.length) lines.push("## 未展开线索", "", ...leads.map((text) => `- ${escapeMarkdown(text)}`), "");
  lines.push("## 报告边界", "", ...report.limitations.map((text) => `- ${escapeMarkdown(text)}`), "");
  const quotes = reportEvidence(report);
  if (quotes.length) lines.push("## 原话索引", "");
  for (const quote of quotes) lines.push(`- Evidence: ${quote.evidenceIds.join(", ")}`, `  - 问题：${escapeMarkdown(quote.question)}`, `  - 原话：“${escapeMarkdown(quote.answerQuote)}”`, "");
  if (!report.integrity.valid) lines.push("报告完整性校验未通过。", ...report.integrity.errors.map(escapeMarkdown));
  return lines.join("\n");
}

export function buildInterviewReportBundle(
  state: InterviewState,
  options: { generatedAt?: string } = {},
): InterviewReportBundle {
  const report = buildCandidateReportArtifact(state, options.generatedAt);
  return { report, markdown: renderInterviewReportMarkdown(report) };
}
