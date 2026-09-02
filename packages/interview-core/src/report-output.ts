import type {
  Evidence,
  InterviewState,
  ReportField,
} from "./index.ts";

export interface CandidateReportEvidenceReference {
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

export interface CandidateReportFieldOutput {
  fieldId: string;
  name: string;
  description: string;
  status: ReportField["status"];
  conclusion: string;
  evidence: CandidateReportEvidenceReference[];
  recommendation?: string;
}

export interface CandidateReportFinding {
  projectId: string;
  projectName: string;
  fieldId: string;
  fieldName: string;
  status: ReportField["status"];
  conclusion: string;
  evidenceIds: string[];
}

export interface CandidateReportGap {
  projectId: string;
  projectName: string;
  fieldId: string;
  fieldName: string;
  reason: string;
  recommendedAction: string;
}

export interface CandidateReportArtifact {
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

function conclusion(field: ReportField): string {
  if (field.summary) return field.summary;
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
        conclusion: conclusion(field),
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
  const recommendationValue = reportRecommendation(summary);
  const integrityErrors = validateReportIntegrity(state);
  return {
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
      ...(state.role.source === "generic" ? ["未提供 Job Description，本报告不能形成具体岗位匹配结论。"] : []),
      "当前报告使用跨岗位通用调查维度，不等价于对每条岗位要求逐项验证。",
      "招聘建议只基于本次面试获得的证据，不包含背调、作品核验或其他招聘环节信息。",
    ],
    integrity: { valid: integrityErrors.length === 0, errors: integrityErrors },
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+.!|>-])/g, "\\$1");
}

function recommendationLabel(value: CandidateReportArtifact["executiveSummary"]["recommendation"]): string {
  if (value === "hold_for_clarification") return "暂缓判断，先澄清冲突";
  if (value === "insufficient_evidence") return "证据不足，暂不判断";
  if (value === "continue_with_verification") return "可继续流程，但需定向核验";
  return "可进入下一招聘环节";
}

function renderFindings(lines: string[], title: string, findings: CandidateReportFinding[], empty: string): void {
  lines.push("", `## ${title}`, "");
  if (findings.length === 0) {
    lines.push(empty);
    return;
  }
  for (const item of findings) {
    lines.push(
      `- **${escapeMarkdown(item.projectName)} / ${escapeMarkdown(item.fieldName)}**：${escapeMarkdown(item.conclusion)}`,
      `  - Evidence: ${item.evidenceIds.map((id) => `\`${id}\``).join("、")}`,
    );
  }
}

export function renderInterviewReportMarkdown(report: CandidateReportArtifact): string {
  const lines = [
    `# 候选人评估报告：${escapeMarkdown(report.candidate.name)}`,
    "",
    `- Session: \`${report.sessionId}\``,
    `- 目标岗位: ${escapeMarkdown(report.role.name)}`,
    `- 报告状态: ${report.status}`,
    `- 生成时间: ${report.generatedAt}`,
    `- 候选人填写技能: ${report.candidate.skills.map(escapeMarkdown).join("、") || "未填写"}`,
    "",
    "## 综合判断",
    "",
    `**建议：${recommendationLabel(report.executiveSummary.recommendation)}**`,
    "",
    escapeMarkdown(report.executiveSummary.assessment),
    "",
    ...report.executiveSummary.rationale.map((item) => `- ${escapeMarkdown(item)}`),
  ];
  renderFindings(lines, "已验证优势", report.executiveSummary.strengths, "当前没有达到充分证据标准的优势结论。");
  renderFindings(lines, "风险与关注项", report.executiveSummary.concerns, "当前没有发现证据偏弱或相互冲突的结论。");
  lines.push("", "## 证据缺口", "");
  if (report.executiveSummary.evidenceGaps.length === 0) lines.push("当前通用调查维度均已获得回答证据。");
  for (const gap of report.executiveSummary.evidenceGaps) {
    lines.push(
      `- **${escapeMarkdown(gap.projectName)} / ${escapeMarkdown(gap.fieldName)}**：${escapeMarkdown(gap.reason)}`,
      `  - 下一步：${escapeMarkdown(gap.recommendedAction)}`,
    );
  }
  lines.push("", "## 招聘方下一步建议", "", ...report.executiveSummary.nextSteps.map((item) => `- ${escapeMarkdown(item.trim())}`));
  lines.push(
    "",
    "## 岗位与评估范围",
    "",
    `### ${escapeMarkdown(report.role.name)}`,
    "",
    escapeMarkdown(report.role.description),
  );
  if (report.role.requirements.length > 0) {
    lines.push("", "岗位要求：", "", ...report.role.requirements.map((item) => `- ${escapeMarkdown(item)}`));
  }
  lines.push("", "## 分项目详细评估");
  for (const project of report.projects) {
    lines.push("", `### 项目：${escapeMarkdown(project.name)}`, "", `候选人填写：${escapeMarkdown(project.candidateInput)}`);
    for (const field of project.fields) {
      lines.push("", `#### ${escapeMarkdown(field.name)} — ${field.status}`, "", escapeMarkdown(field.conclusion));
      if (field.evidence.length > 0) {
        lines.push("", "证据：");
        for (const item of field.evidence) {
          lines.push(
            "",
            `- Evidence \`${item.evidenceId}\` / Turn \`${item.turnId}\``,
            `  - 问题：${escapeMarkdown(item.question)}`,
            `  - 原话：“${escapeMarkdown(item.answerQuote)}”`,
            `  - 判断：${escapeMarkdown(item.statement)} (${item.polarity})`,
          );
        }
      }
      if (field.recommendation) lines.push("", `核验建议：${escapeMarkdown(field.recommendation)}`);
    }
  }
  lines.push("", "## 矛盾记录", "");
  if (report.contradictions.length === 0) lines.push("本次面试未记录候选人陈述矛盾。");
  for (const item of report.contradictions) {
    lines.push(`- ${item.status}: ${escapeMarkdown(item.projectName ?? "未归属项目")} — ${escapeMarkdown(item.claim)}`);
  }
  lines.push("", "## 评估依据", "", ...report.evaluationBasis.map((item) => `- ${escapeMarkdown(item)}`));
  lines.push("", "## 报告边界", "", ...report.limitations.map((item) => `- ${escapeMarkdown(item)}`));
  lines.push("", "## 报告完整性", "", `- Valid: ${report.integrity.valid}`);
  for (const error of report.integrity.errors) lines.push(`- ${escapeMarkdown(error)}`);
  lines.push("");
  return lines.join("\n");
}

export function buildInterviewReportBundle(
  state: InterviewState,
  options: { generatedAt?: string } = {},
): InterviewReportBundle {
  const report = buildCandidateReportArtifact(state, options.generatedAt);
  return { report, markdown: renderInterviewReportMarkdown(report) };
}
