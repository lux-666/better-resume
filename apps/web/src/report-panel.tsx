import { useEffect, useState } from "react";
import type { InterviewReportResponse } from "@better-resume/api-contract";
import { reportSections, reportEvidence, reportInsights, reportImprovementPlan } from "../../../packages/interview-core/src/report-output.ts";
import { CompetencyRadar } from "./competency-radar.tsx";
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
  const assessment = report.assessment;
  const sections = reportSections(report);
  const insights = reportInsights(report);
  const plan = reportImprovementPlan(report);
  const quotes = reportEvidence(report);
  const overall = sections.find((section) => section.title === "综合判断");
  const analysis = report.narrative ? sections.filter((section) => !["综合判断", "招聘方下一步建议", "候选人反馈"].includes(section.title)) : [];
  const statusLabels = { supported: "已获得支持", partial: "部分支持", weak: "细节不足", contradicted: "存在冲突", not_investigated: "尚未调查" };
  const evidenceLinks = (ids: string[]) => <span className="citations">{ids.map((id) => <a key={id} href={`#evidence-${id}`} onClick={(event) => {
    const target = document.getElementById(`evidence-${id}`);
    if (!target) return;
    event.preventDefault(); const details = target.closest("details"); if (details) details.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }}>原话 {Math.max(0, quotes.findIndex((quote) => quote.evidenceIds.includes(id))) + 1}</a>)}</span>;
  const paragraph = (items: Array<{ text: string; evidenceIds: string[] }>) => items.map((item, index) => <p key={index}>{item.text}{evidenceLinks(item.evidenceIds)}</p>);
  return <section className="report-panel assessment-report" aria-label="候选人报告预览">
    <div className="report-toolbar"><span>COMPETENCY ASSESSMENT / {report.status === "complete" ? "完整报告" : "面试进行中"}</span>
      <div><button className="secondary" onClick={() => window.print()}>打印 / 保存 PDF</button>
        {report.status === "complete" && <button className="secondary" disabled={report.narrativeStatus === "pending"} onClick={() => {
          void post<InterviewReportResponse>(`/api/interviews/${sessionId}/report-retry`).then((value) => { setBundle(value); setRefresh((n) => n + 1); }).catch(() => setError("报告生成请求失败"));
        }}>{report.narrativeStatus === "pending" ? "分析生成中…" : "重新生成分析"}</button>}</div>
    </div>
    <div className="report-hero">
      <div><p className="report-kicker">从项目经历，到岗位能力</p><h2>岗位胜任力评估报告</h2>
        <p className="report-identity"><strong>{report.candidate.name}</strong><span>{report.role.name}</span></p>
        <p className="report-date">{new Date(report.generatedAt).toLocaleDateString("zh-CN")} · 第 {version} 版</p>
        <div className="report-tags">{report.candidate.skills.slice(0, 8).map((skill) => <span key={skill}>{skill}</span>)}</div>
      </div>
      <div className="match-card">
        <div className="match-number"><strong>{assessment?.match.score ?? "—"}</strong>{assessment?.match.score !== null && assessment?.match.score !== undefined && <span>/ 100</span>}</div>
        <h3>岗位匹配度评分</h3><span className="report-badge">{assessment?.match.status === "assessed" ? "已调查要求评分" : assessment?.match.status === "provisional" ? "暂定 · 仅限已调查范围" : "等待岗位评估"}</span>
        <p>{assessment?.match.explanation ?? "评分数据尚未生成。"}</p>
        {assessment && <div className="match-coverage"><span>岗位要求覆盖率</span><strong>{assessment.match.coveragePercent}%</strong><progress max="100" value={assessment.match.coveragePercent} /></div>}
      </div>
    </div>
    <div className="report-metrics">
      <div><strong>{assessment?.answeredQuestions ?? "—"}</strong><span>已回答问题</span></div>
      <div><strong>{assessment?.investigatedProjects ?? "—"}<small> / {report.projects.length}</small></strong><span>已交流项目</span></div>
      <div><strong>{assessment?.coveragePercent ?? 0}<small>%</small></strong><span>调查项覆盖率</span></div>
      <div><strong>{quotes.length}</strong><span>可追溯原话</span></div>
    </div>
    <section className="report-overview"><div className="report-section-heading"><span>01</span><h3>综合评价</h3></div>
      {overall ? paragraph(overall.paragraphs) : <p>{report.narrativeStatus === "pending" ? "正在结合本次回答生成综合分析，能力画像和已核实事实已可查看。" : report.narrativeStatus === "failed" ? "综合分析暂未生成成功，下方保留已核实事实与评分依据，可重新生成分析。" : "以下展示本次已核实的能力与事实，完整综合分析将在面试结束后自动生成。"}</p>}
      {report.narrativeStatus === "pending" && overall && <p role="status" className="field-hint">新版分析生成中，当前保留上一版内容。</p>}
      {Boolean(assessment?.match.blockers.length) && <details className="must-gaps"><summary>必须要求仍需核验 · {assessment!.match.blockers.length} 项</summary>{assessment!.match.blockers.map((text) => <p key={text}>{text}</p>)}</details>}
    </section>
    {assessment && <section><div className="report-section-heading"><span>02</span><h3>能力画像</h3><p>以实际展示深度为依据</p></div>
      <div className="ability-grid"><div className="radar-card"><CompetencyRadar dimensions={assessment.dimensions} /></div>
        <div className="dimension-details">{assessment.dimensions.map((dimension) => <div className="dimension-row" key={dimension.competencyId}>
          <div><strong>{dimension.name}</strong><b>{dimension.score === null ? "待评估" : `${dimension.score} / 100`}</b></div>
          <div className="dimension-track" aria-hidden="true">{dimension.score !== null && <span style={{ width: `${dimension.score}%` }} />}</div>
          <p>{dimension.level}{evidenceLinks(dimension.evidenceIds)}</p>
        </div>)}</div>
      </div>
    </section>}
    <section><div className="report-section-heading"><span>03</span><h3>优势与劣势分析</h3><p>区分已展示优势、薄弱表现和待验证内容</p></div>
      <div className="insight-grid">{(["strength", "development"] as const).map((group) => <div className={`insight-column ${group}`} key={group}>
        <h4>{group === "strength" ? "已展示的优势" : "待提升与风险"}</h4>
        {insights.filter((item) => group === "strength" ? item.kind === "strength" : item.kind !== "strength").map((item, i) => <div className="insight-card" key={i}>
          <span className="insight-label">{item.kind === "strength" ? "优势" : item.kind === "risk" ? "需核验" : "待提升"}</span>
          <h5>{item.title}</h5>{paragraph([item.explanation])}
        </div>)}
        {!insights.some((item) => group === "strength" ? item.kind === "strength" : item.kind !== "strength") && <p className="field-hint">{group === "strength" ? "当前还没有形成可引用的优势结论。" : "当前未记录可据此判断的薄弱表现；尚未调查的内容不视为劣势。"}</p>}
      </div>)}</div>
    </section>
    {analysis.length > 0 && <section className="project-analysis"><div className="report-section-heading"><span>04</span><h3>关键经历分析</h3></div>
      {analysis.map((section, index) => <div className="analysis-chapter" key={index}><h4>{section.title}</h4>{paragraph(section.paragraphs)}</div>)}
    </section>}
    <section><div className="report-section-heading"><span>{analysis.length ? "05" : "04"}</span><h3>能力提升路径</h3><p>把评价变成可执行、可验收的练习</p></div>
      <div className="improvement-roadmap">{plan.map((item, index) => <div className="improvement-card" key={index}>
        <div className="plan-step"><b>{String(index + 1).padStart(2, "0")}</b><span>{{ first: "优先完成", next: "随后推进", stretch: "进阶挑战" }[item.priority]}</span></div>
        <h4>{item.title}</h4><div className="plan-rationale">{paragraph([item.rationale])}</div>
        <h5>练习与产出</h5><p>{item.action}</p><div className="plan-acceptance"><h5>完成标准</h5><p>{item.acceptance}</p></div>
      </div>)}</div>
      {!plan.length && <p className="field-hint">完成项目回答后，将根据实际表现确定练习任务与完成标准。</p>}
    </section>
    {sections.some((section) => section.title === "招聘方下一步建议") && <section className="recruiter-notes"><h4>招聘方核验建议</h4>{paragraph(sections.find((section) => section.title === "招聘方下一步建议")!.paragraphs)}</section>}
    {Boolean(report.requirementMatrix?.length) && <details className="report-appendix"><summary>岗位要求逐项对应</summary><div className="requirement-table">
      {report.requirementMatrix!.map((row) => <div className="requirement-row" key={row.requirementId}>
        <span>{{ must: "必须", should: "应有", nice: "加分" }[row.priority]}</span><div><strong>{row.text}</strong>
          {paragraph(report.narrative?.requirements?.filter((item) => item.requirementId === row.requirementId && item.conclusion.evidenceIds.length).map((item) => item.conclusion) ?? [])}
          {evidenceLinks(row.evidenceIds)}</div><b>{statusLabels[row.status]}</b>
      </div>)}
    </div></details>}
    <details className="report-appendix"><summary>评估范围与评分方法</summary>
      {assessment?.methodology.map((text) => <p key={text}>{text}</p>)}
      {report.summary.missing > 0 && <><h4>尚未覆盖的内容</h4>{report.projects.filter((project) => project.fields.some((field) => field.status === "missing")).map((project) => <p key={project.projectId}>
        <strong>{project.name}</strong>：{project.fields.filter((field) => field.status === "missing").map((field) => field.name).join("、")}</p>)}</>}
      {report.limitations.map((text) => <p className="field-hint" key={text}>{text}</p>)}
      {report.leads.some((lead) => lead.status === "dropped") && <><h4>未展开线索</h4>{[...new Set(report.leads.filter((lead) => lead.status === "dropped").map((lead) => lead.text))].map((text) => <p key={text}>“{text}”</p>)}</>}
    </details>
    {quotes.length > 0 && <details className="report-appendix evidence-index"><summary>原话与判断依据 · {quotes.length} 条</summary>{quotes.map((quote, index) => <blockquote key={quote.evidenceIds[0]}>
      {quote.evidenceIds.map((id) => <span id={`evidence-${id}`} key={id} />)}<span className="insight-label">原话 {index + 1}</span>
      <p>{quote.question}</p><strong>“{quote.answerQuote}”</strong>
    </blockquote>)}</details>}
    <p className="report-endnote">本报告依据本次面试记录生成 · 每项判断均可回溯至候选人原话</p>
    {!report.integrity.valid && <p className="error">报告完整性校验未通过，评分暂不可用。</p>}{error && <p className="error">{error}</p>}
  </section>;
}
