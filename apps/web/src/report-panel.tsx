import { useEffect, useState } from "react";
import type { InterviewReportResponse } from "@better-resume/api-contract";
import { post, request } from "./api.ts";
export function ReportPanel({ sessionId, version }: { sessionId: string; version: number }) {
  const [bundle, setBundle] = useState<InterviewReportResponse>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      try {
        const value = await request<InterviewReportResponse>(`/api/interviews/${sessionId}/report`);
        if (disposed) return;
        setBundle(value); setError("");
        if (value.report.narrativeStatus === "pending") timer = setTimeout(() => void sync(), 2000);
      } catch { if (!disposed) setError("报告暂不可用，请稍后刷新。"); }
    };
    void sync(); return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId, version, refresh]);
  if (!bundle) return <p>{error || "正在读取报告…"}</p>;
  const report = bundle.report;
  const paragraph = (items: Array<{ text: string; evidenceIds: string[] }>) => items.map((item, index) => <p key={index}>{item.text}
    <span className="citations">{item.evidenceIds.map((id, i) => <a key={id} href={`#evidence-${id}`}>原话 {i + 1}</a>)}</span></p>);
  return <section className="report-panel" aria-label="候选人报告预览">
    <h3>{report.candidate.name} · {report.role.name}</h3>
    <p className="field-hint">{report.status === "complete" ? "最终报告" : "当前报告"} · 版本 {version}</p>
    <p>{report.executiveSummary.assessment}</p>
    {report.narrativeStatus === "pending" && <p role="status"><span className="spinner" />正在生成报告叙述；下方事实报告已可阅读和下载。</p>}
    {report.narrativeStatus === "failed" && <div><p className="error">叙述生成失败，事实报告仍可使用。</p><button className="secondary" onClick={() => {
      void post(`/api/interviews/${sessionId}/report-retry`).then(() => setRefresh((n) => n + 1)).catch(() => setError("重试请求失败"));
    }}>重试报告叙述</button></div>}
    {report.narrative && <div className="narrative"><h4>综合叙述</h4>{paragraph(report.narrative.overall)}
      <h4>能力边界</h4>{report.narrative.competencies.map((item) => <div key={item.competencyId}><strong>{report.competencies.find((c) => c.competencyId === item.competencyId)?.name}</strong>{paragraph(item.boundary)}{paragraph(item.highlights)}</div>)}
      <h4>项目结论</h4>{report.narrative.projects.map((item) => <div key={item.projectId}><strong>{report.projects.find((p) => p.projectId === item.projectId)?.name}</strong>{paragraph(item.summary)}</div>)}
      <h4>招聘方下一步</h4>{paragraph(report.narrative.recruiterNextSteps)}<h4>候选人反馈</h4>{paragraph(report.narrative.candidateFeedback)}</div>}
    {report.projects.map((project) => <section key={project.projectId}><h4>{project.name}</h4>
      {project.fields.map((field) => <details className="report-field" key={field.fieldId}>
        <summary><strong>{field.name}</strong><span>{field.status} · 已展示层级 {field.detail.reachedDepth ?? "未知"}</span></summary>
        <p>{field.conclusion}</p>
        {field.detail.boundaryReason && <blockquote>第 {field.detail.boundaryReason.depthLevel} 层尚未展开：“{field.detail.boundaryReason.sourceQuote}”</blockquote>}
        {field.evidence.map((evidence) => <blockquote id={`evidence-${evidence.evidenceId}`} key={evidence.evidenceId}><p>{evidence.question}</p><strong>“{evidence.answerQuote}”</strong><p>{evidence.statement} · {evidence.polarity}</p></blockquote>)}
        {field.recommendation && <p>{field.recommendation}</p>}
      </details>)}</section>)}
    <h4>未展开线索</h4>{report.leads.filter((lead) => lead.status === "dropped").map((lead) => <p key={lead.id}>“{lead.text}” <small>Turn {lead.turnId}</small></p>)}
    <h4>证据强度指数</h4><p className="field-hint">描述本次证据强度，不是候选人能力总分。</p>
    {report.competencies.map((item) => <p key={item.competencyId}>{item.name}：{item.evidenceStrengthIndex ?? "未知"} · 置信度 {item.confidence.toFixed(2)}</p>)}
    <h4>报告边界</h4>{report.limitations.map((item) => <p className="field-hint" key={item}>{item}</p>)}
    {!report.integrity.valid && <p className="error">报告完整性校验未通过。</p>}{error && <p className="error">{error}</p>}
  </section>;
}
