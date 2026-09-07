import { Check } from "typebox/value";
import { ReportNarrativeSchema, type NarrativeSentence, type ReportNarrative } from "./narrative-schema.ts";
import { reportInsights, reportImprovementPlan, type CandidateReportArtifact } from "./report-output.ts";
export const noEvidenceText = "本次尚未获得足够的可核验信息，无法形成能力结论。";
export function competencyVerdict(report: CandidateReportArtifact, competencyId: string): ReportNarrative["competencies"][number]["verdict"] {
  const item = report.competencies.find((entry) => entry.competencyId === competencyId);
  if (!item) throw new Error("Unknown competency");
  if (item.statusCounts.contradicted) return "conflicting";
  if (item.statusCounts.supported && !item.statusCounts.missing && !item.statusCounts.weak) return "demonstrated";
  return item.statusCounts.supported ? "partially_demonstrated" : "not_demonstrated";
}
export function validateNarrative(value: unknown, report: CandidateReportArtifact): ReportNarrative {
  if (!report.integrity.valid) throw new Error("Report integrity failed");
  if (!Check(ReportNarrativeSchema, value)) throw new Error("Invalid narrative structure");
  const references = new Map(report.projects.flatMap((project) => project.fields.flatMap((field) => field.evidence)).map((item) => [item.evidenceId, item]));
  const structural = (sentence: NarrativeSentence) => sentence.text === noEvidenceText && sentence.evidenceIds.length === 0;
  const verify = (sentence: NarrativeSentence, allowed?: Set<string>) => {
    if (structural(sentence)) {
      if (allowed ? allowed.size > 0 : references.size > 0) throw new Error("Unsupported absence claim");
      return;
    }
    if (!sentence.evidenceIds.length || sentence.evidenceIds.some((id) => !references.has(id) || (allowed && !allowed.has(id)))) throw new Error("Narrative citation is missing or out of scope");
    if (/录用|淘汰|薪资|职级|rubric/i.test(sentence.text)) throw new Error("Narrative exceeds the report remit");
    const cited = sentence.evidenceIds.map((id) => references.get(id)!);
    const source = cited.map((item) => `${item.answerQuote} ${item.statement} ${item.depthLevel ?? ""}`).join(" ");
    const allowedNumbers = new Set((source + " " + Object.values(report.summary).join(" ") + " " + JSON.stringify(report.assessment ?? {})).match(/\d+(?:\.\d+)?/g) ?? []);
    if ((sentence.text.match(/\d+(?:\.\d+)?/g) ?? []).some((number) => !allowedNumbers.has(number))) throw new Error("Narrative invents a number");
  };
  const must = (report.requirementMatrix ?? []).filter((r) => r.priority === "must");
  const statements = value.requirements ?? [];
  if (statements.length !== must.length || new Set(statements.map((r) => r.requirementId)).size !== must.length) throw new Error("Narrative must-requirement coverage mismatch");
  for (const statement of statements) {
    const row = must.find((r) => r.requirementId === statement.requirementId);
    if (!row || statement.status !== row.status) throw new Error("Requirement verdict conflicts with matrix");
    verify(statement.conclusion, new Set(row.evidenceIds));
  }
  value.overall.forEach((sentence) => verify(sentence));
  const written = new Set(value.overall.map((sentence) => sentence.text.trim()));
  for (const section of value.sections ?? []) {
    verify({ text: section.title, evidenceIds: [...new Set(section.paragraphs.flatMap((sentence) => sentence.evidenceIds))] });
    for (const sentence of section.paragraphs) {
      verify(sentence);
      if (structural(sentence)) throw new Error("Omit empty narrative sections");
      if (written.has(sentence.text.trim())) throw new Error("Narrative repeats a sentence");
      written.add(sentence.text.trim());
    }
  }
  if (new Set(value.competencies.map((item) => item.competencyId)).size !== value.competencies.length) throw new Error("Duplicate narrative competency");
  for (const item of value.competencies) {
    if (item.verdict !== competencyVerdict(report, item.competencyId)) throw new Error("Narrative verdict conflicts with report");
    const allowed = new Set(report.competencies.find((entry) => entry.competencyId === item.competencyId)!.evidenceIds);
    [...item.boundary, ...item.highlights].forEach((sentence) => verify(sentence, allowed));
  }
  if (new Set(value.projects.map((item) => item.projectId)).size !== value.projects.length) throw new Error("Duplicate narrative project");
  for (const item of value.projects) {
    const project = report.projects.find((entry) => entry.projectId === item.projectId);
    if (!project) throw new Error("Unknown narrative project");
    const allowed = new Set(project.fields.flatMap((field) => field.evidence.map((evidence) => evidence.evidenceId)));
    item.summary.forEach((sentence) => verify(sentence, allowed));
  }
  [...value.recruiterNextSteps, ...value.candidateFeedback].forEach((sentence) => verify(sentence));
  for (const insight of value.insights ?? []) {
    verify(insight.explanation);
    verify({ text: insight.title, evidenceIds: insight.explanation.evidenceIds });
    if (insight.kind === "strength" && !insight.explanation.evidenceIds.some((id) => {
      const evidence = references.get(id)!;
      return evidence.polarity === "support" && evidence.strength * evidence.specificity >= .45
        && report.executiveSummary.strengths.some((finding) => finding.evidenceIds.includes(id));
    })) throw new Error("Strength must cite supported evidence");
  }
  for (const item of value.improvementPlan ?? []) {
    verify(item.rationale);
    verify({ text: item.title, evidenceIds: item.rationale.evidenceIds });
    if (/录用|淘汰|薪资|职级|保证通过/.test(item.action + item.acceptance)) throw new Error("Plan exceeds the report remit");
  }
  const unexplored = report.leads.filter((lead) => lead.status === "dropped").map((lead) => lead.text).sort();
  if (JSON.stringify([...value.unexploredLeads].sort()) !== JSON.stringify(unexplored)) throw new Error("Unexplored leads do not match the report");
  return value;
}
export function demoNarrative(report: CandidateReportArtifact): ReportNarrative {
  const all = [...new Map(report.projects.flatMap((p) => p.fields.flatMap((f) => f.evidence)).map((e) => [e.evidenceId, e])).values()];
  const quote = (ids: string[]): NarrativeSentence => {
    const evidence = all.find((item) => ids.includes(item.evidenceId));
    return evidence ? { text: `候选人说明：“${evidence.answerQuote}”`, evidenceIds: [evidence.evidenceId] } : { text: noEvidenceText, evidenceIds: [] };
  };
  return validateNarrative({ schemaVersion: "report-narrative-v0.1", requirements: (report.requirementMatrix ?? []).filter((r) => r.priority === "must").map((r) => ({ requirementId: r.requirementId, status: r.status, conclusion: quote(r.evidenceIds) })), overall: [quote(all.map((e) => e.evidenceId))],
    insights: reportInsights(report), improvementPlan: reportImprovementPlan(report),
    competencies: report.competencies.map((c) => ({ competencyId: c.competencyId, verdict: competencyVerdict(report, c.competencyId), boundary: [quote(c.evidenceIds)], highlights: [] })),
    projects: report.projects.map((p) => ({ projectId: p.projectId, summary: [quote(p.fields.flatMap((f) => f.evidence.map((e) => e.evidenceId)))] })),
    recruiterNextSteps: all.length ? [{ text: "下一轮可围绕这段经历补充核验具体实施过程。", evidenceIds: [all[0].evidenceId] }] : [],
    candidateFeedback: all.length ? [{ text: "可以为这段经历准备可复核的实施记录。", evidenceIds: [all[0].evidenceId] }] : [],
    unexploredLeads: report.leads.filter((lead) => lead.status === "dropped").map((lead) => lead.text),
  }, report);
}
