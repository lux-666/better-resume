import { Check } from "typebox/value";
import { ReportNarrativeSchema, type NarrativeSentence, type ReportNarrative } from "./narrative-schema.ts";
import type { CandidateReportArtifact } from "./report-output.ts";
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
    if (/录用|淘汰|薪资|职级|等级|rubric|评分|得分/i.test(sentence.text)) throw new Error("Narrative exceeds the report remit");
    const cited = sentence.evidenceIds.map((id) => references.get(id)!);
    const source = cited.map((item) => `${item.answerQuote} ${item.statement} ${item.depthLevel ?? ""}`).join(" ");
    const allowedNumbers = new Set((source + " " + Object.values(report.summary).join(" ")).match(/\d+(?:\.\d+)?/g) ?? []);
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
  if (new Set(value.competencies.map((item) => item.competencyId)).size !== report.competencies.length || value.competencies.length !== report.competencies.length) throw new Error("Narrative competency coverage mismatch");
  for (const item of value.competencies) {
    if (item.verdict !== competencyVerdict(report, item.competencyId)) throw new Error("Narrative verdict conflicts with report");
    const allowed = new Set(report.competencies.find((entry) => entry.competencyId === item.competencyId)!.evidenceIds);
    [...item.boundary, ...item.highlights].forEach((sentence) => verify(sentence, allowed));
  }
  if (new Set(value.projects.map((item) => item.projectId)).size !== report.projects.length || value.projects.length !== report.projects.length) throw new Error("Narrative project coverage mismatch");
  for (const item of value.projects) {
    const project = report.projects.find((entry) => entry.projectId === item.projectId);
    if (!project) throw new Error("Unknown narrative project");
    const allowed = new Set(project.fields.flatMap((field) => field.evidence.map((evidence) => evidence.evidenceId)));
    item.summary.forEach((sentence) => verify(sentence, allowed));
  }
  [...value.recruiterNextSteps, ...value.candidateFeedback].forEach((sentence) => verify(sentence));
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
    competencies: report.competencies.map((c) => ({ competencyId: c.competencyId, verdict: competencyVerdict(report, c.competencyId), boundary: [quote(c.evidenceIds)], highlights: [] })),
    projects: report.projects.map((p) => ({ projectId: p.projectId, summary: [quote(p.fields.flatMap((f) => f.evidence.map((e) => e.evidenceId)))] })),
    recruiterNextSteps: all.length ? [{ text: "下一轮可围绕这段经历补充核验具体实施过程。", evidenceIds: [all[0].evidenceId] }] : [],
    candidateFeedback: all.length ? [{ text: "可以为这段经历准备可复核的实施记录。", evidenceIds: [all[0].evidenceId] }] : [],
    unexploredLeads: report.leads.filter((lead) => lead.status === "dropped").map((lead) => lead.text),
  }, report);
}
export function renderNarrativeMarkdown(narrative: ReportNarrative): string {
  const escape = (text: string) => text.replace(/([\\`*_{}[\]()#+.!|>-])/g, "\\$1");
  const sentence = (item: NarrativeSentence) => `- ${escape(item.text)}${item.evidenceIds.length ? ` [Evidence: ${item.evidenceIds.join(", ")}]` : ""}`;
  return ["## 报告叙述", "", ...narrative.overall.map(sentence), "", ...narrative.projects.flatMap((p) => p.summary.map(sentence)),
    "", ...(narrative.requirements ?? []).flatMap((r) => [`### 必须要求 ${escape(r.requirementId)} · ${r.status}`, sentence(r.conclusion), ""]), "### 招聘方核验建议", "", ...narrative.recruiterNextSteps.map(sentence), "", "### 候选人反馈", "", ...narrative.candidateFeedback.map(sentence), ""].join("\n");
}
