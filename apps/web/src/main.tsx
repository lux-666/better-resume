import { HistoryPanel } from "./history-panel.tsx";
import { DemoProfiles } from "./demo-profiles.tsx";
import { ReportPanel } from "./report-panel.tsx";
import { SupplementForm } from "./supplement-form.tsx";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  CreateInterviewBody,
  InterviewReportResponse,
  InterviewStateResponse,
  RuntimeInfo,
} from "@better-resume/api-contract";
import { extractPdfPageText, parseResume } from "./intake-parser.ts";
import "./style.css";

import { post, request } from "./api.ts";
import { useInterviewSession } from "./use-interview-session.ts";
import { RunProgressPanel } from "./run-progress.tsx";
import { InterviewTimeReminder } from "./interview-time-reminder.tsx";
import { TechnicalPanel } from "./technical-panel.tsx";

const pilotMode = new URLSearchParams(window.location.search).get("pilot") === "1";
const pilotStartedAtKey = (sessionId: string) => `better-resume-pilot-started-at:${sessionId}`;

type HealthResponse = { ok: boolean; runtime: RuntimeInfo };
type ProjectForm = {
  key: string;
  name: string;
  description: string;
};
type ExtractedDocument = { fileName: string; text: string };

const maximumDocumentCharacters = 100_000;
const documentAccept = ".txt,.md,.markdown,.csv,.json,.pdf,.jpg,.jpeg,.png,.webp,text/plain,text/markdown,application/pdf,image/jpeg,image/png,image/webp";
const emptyProject = (): ProjectForm => ({
  key: crypto.randomUUID(),
  name: "",
  description: "",
});

async function extractTextDocument(file: File): Promise<ExtractedDocument> {
  if (file.size > 8 * 1024 * 1024) throw new Error("文件不能超过 8 MB");
  const mediaType = file.type || "text/plain";
  let text: string;
  if (mediaType === "application/pdf" || file.name.toLocaleLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(extractPdfPageText(content.items));
      }
    } finally {
      await loadingTask.destroy();
    }
    text = pages.join("\n");
  } else if (/^image\/(jpeg|png|webp)$/.test(mediaType) || /\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(["chi_sim", "eng"]);
    try {
      text = (await worker.recognize(file)).data.text;
    } finally {
      await worker.terminate();
    }
  } else if (/^text\//.test(mediaType) || /\.(txt|md|markdown|csv|json)$/i.test(file.name)) {
    text = await file.text();
  } else {
    throw new Error("当前只支持文本文件、Markdown、文本型 PDF 和 JPG/PNG/WebP 图片");
  }
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("文件中没有提取到文字；请上传文本型 PDF 或清晰的 JD 图片");
  if (normalized.length > maximumDocumentCharacters) throw new Error("提取后的文本不能超过 100,000 字符");
  return { fileName: file.name, text: normalized };
}

function App() {
  const [candidateName, setCandidateName] = useState("");
  const [skills, setSkills] = useState("");
  const [projects, setProjects] = useState<ProjectForm[]>([emptyProject()]);
  const [jobTitle, setJobTitle] = useState("");
  const [jobIntroduction, setJobIntroduction] = useState("");
  const [jobResponsibilities, setJobResponsibilities] = useState("");
  const [jobRequirements, setJobRequirements] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeConsent, setResumeConsent] = useState(false);
  const [timeBudget, setTimeBudget] = useState(30);
  const [maxTurns, setMaxTurns] = useState(15);
  const [importNotice, setImportNotice] = useState("");
  const [extractingDocument, setExtractingDocument] = useState<"resume" | "job">();
  const { session, answer, setAnswer, pendingCommandId, busyAction, busyRef,
    error, setError, restore, clear, open, runOnce, start, submit, run, isProcessing, connection } = useInterviewSession();
  const [auditTab, setAuditTab] = useState<"interview" | "evidence" | "technical" | "report">("interview");
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [serverRuntime, setServerRuntime] = useState<RuntimeInfo>();
  const interview = session?.state;
  const runtime = session?.runtime ?? serverRuntime;
  const progress = session?.progress;
  const latestTrace = interview?.traces.at(-1);
  const activeField = interview?.report.fields.find((field) => field.id === latestTrace?.targetFieldId);
  const activeProject = interview?.candidate.projects.find((project) => project.id === activeField?.projectId);
  const jobValues = [jobTitle, jobIntroduction, jobResponsibilities, jobRequirements];
  const hasJobInput = jobValues.some((value) => value.trim());
  const jobIsIncomplete = hasJobInput && jobValues.some((value) => !value.trim());

  useEffect(() => {
    request<HealthResponse>("/api/health")
      .then((health) => setServerRuntime(health.runtime))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "API 未启动"));
  }, []);

  useEffect(() => { setAuditTab("interview"); }, [interview?.sessionId]);
  const backstage = Boolean(interview) && auditTab !== "interview";

  function newInterview(): void {
    if (busyRef.current) return;
    clear();
    setHistoryRefresh((value) => value + 1);
    setResumeText(""); setResumeConsent(false);
    setCandidateName("");
    setSkills("");
    setProjects([emptyProject()]);
    setJobTitle("");
    setJobIntroduction("");
    setJobResponsibilities("");
    setJobRequirements("");
    setImportNotice("");
  }

  function createInterview(): void {
    void runOnce("create", async () => {
      try {
        setError("");
        if (!candidateName.trim()) throw new Error("请填写候选人姓名");
        if (projects.length === 0 || !Number.isInteger(maxTurns) || maxTurns < 5 || maxTurns > 50
                || projects.some((project) => !project.name.trim() || !project.description.trim())) {
          throw new Error("至少完整填写一个项目名称和项目经历");
        }
        if (jobIsIncomplete) throw new Error("填写 JD 时，岗位、岗位介绍、职责和要求四项都不能为空");
        const created = await post<InterviewStateResponse>("/api/interviews", {
          candidate: {
            name: candidateName.trim(),
            skills: skills.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
            projects: projects.map((project) => ({
              name: project.name.trim(),
              description: project.description.trim(),
            })),
          },
          timeBudgetMinutes: timeBudget,
          maxTurns,
          ...(resumeConsent && resumeText ? { resume: { consent: true, text: resumeText } } : {}),
          ...(hasJobInput ? {
            job: {
              title: jobTitle.trim(),
              introduction: jobIntroduction.trim(),
              responsibilities: jobResponsibilities.trim(),
              requirements: jobRequirements.trim(),
            },
          } : {}),
        });
        restore(created);
        setHistoryRefresh((value) => value + 1);
        setResumeText(""); setResumeConsent(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "创建失败");
      }
    });
  }

  async function loadDocument(kind: "resume" | "job", file?: File): Promise<void> {
    if (!file) return;
    setExtractingDocument(kind);
    setError("");
    setImportNotice("");
    try {
      const extracted = await extractTextDocument(file);
      if (kind === "resume") {
        setResumeText(extracted.text);
        const parsed = parseResume(extracted.text);
        setCandidateName((current) => current.trim() ? current : parsed.name ?? "");
        setSkills((current) => current.trim() ? current : parsed.skills.join(", "));
        setProjects((current) => {
          const currentIsBlank = current.length === 1 && Object.entries(current[0])
            .filter(([key]) => key !== "key").every(([, value]) => !value);
          const imported = parsed.projects.map((project) => ({ ...project, key: crypto.randomUUID() }));
          return currentIsBlank ? imported : [...current, ...imported];
        });
        setImportNotice(`已从 ${extracted.fileName} 回填候选人信息；全文暂存在此页面，只有勾选后才随会话上传。`);
      } else {
        const parsed = await post<NonNullable<CreateInterviewBody["job"]>>("/api/intake/job", { text: extracted.text });
        setJobTitle(parsed.title);
        setJobIntroduction(parsed.introduction);
        setJobResponsibilities(parsed.responsibilities);
        setJobRequirements(parsed.requirements);
        setImportNotice(`已由 LLM 从 ${extracted.fileName} 填写岗位信息，请检查并修改后创建面试。`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文件解析失败");
    } finally {
      setExtractingDocument(undefined);
    }
  }

  function updateProject(key: string, field: keyof Omit<ProjectForm, "key">, value: string): void {
    setProjects((current) => current.map((project) => project.key === key ? { ...project, [field]: value } : project));
  }

  function exportPilotSession(): void {
    if (!session) return;
    const startedAt = localStorage.getItem(pilotStartedAtKey(session.state.sessionId));
    const exportedAt = new Date().toISOString();
    const durationMinutes = startedAt
      ? Math.round((Date.parse(exportedAt) - Date.parse(startedAt)) / 600) / 100
      : undefined;
    const payload = {
      schemaVersion: 1,
      pilotMode,
      startedAt,
      exportedAt,
      durationMinutes,
      session,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `phase1-pilot-${session.state.sessionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadInterviewReport(format: "json" | "markdown"): Promise<void> {
    if (!interview) return;
    try {
      setError("");
      const bundle = await request<InterviewReportResponse>(`/api/interviews/${interview.sessionId}/report`);
      const content = format === "json" ? JSON.stringify(bundle.report, null, 2) : bundle.markdown;
      const url = URL.createObjectURL(new Blob([content], {
        type: format === "json" ? "application/json" : "text/markdown",
      }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `candidate-report-${interview.sessionId}.${format === "json" ? "json" : "md"}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "报告下载失败");
    }
  }

  async function exportSession(): Promise<void> {
    if (!interview) return;
    try {
      const exported = await request(`/api/interviews/${interview.sessionId}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `session-${interview.sessionId}.json`; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导出失败"); }
  }
  return (
    <main className={interview ? "session-page" : undefined}>
      <header>
        {!interview && <p className="eyebrow">EVIDENCE-DRIVEN INTERVIEW</p>}
        <h1>Better Resume</h1>
        {!interview && <p>从你的项目经历出发，一步步聊清你的工作。</p>}
        {interview && <button className="home-button" type="button" onClick={newInterview}>返回主页</button>}
      </header>
      {interview && <nav className="tabs page-bar" aria-label="页面切换">
        {([ ["interview", "面试"], ["evidence", "后台 · 面试进度"], ["report", "后台 · 报告预览"], ["technical", "后台 · 技术视图"] ] as const).map(([tab, label]) =>
          <button key={tab} aria-current={auditTab === tab ? "page" : undefined} className={auditTab === tab ? "selected" : "secondary"}
            disabled={tab !== "interview" && pilotMode && interview.status === "active"} onClick={() => setAuditTab(tab)}>{label}</button>)}
      </nav>}
      <section className="workspace">
        {!backstage && <article aria-label="面试页面">
          <span>01 / 面试</span>
          <h2>{interview?.status === "active" ? "项目交流" : interview?.status === "completed" ? "本次交流已结束" : interview?.role.name ?? "创建候选人档案"}</h2>
          {!interview && <>
            <DemoProfiles onChoose={(intake) => {
              setResumeText(""); setResumeConsent(false);
              setCandidateName(intake.candidate.name); setSkills(intake.candidate.skills.join("，"));
              setProjects(intake.candidate.projects.map((project) => ({ ...project, key: crypto.randomUUID() })));
              setJobTitle(intake.job?.title ?? ""); setJobIntroduction(intake.job?.introduction ?? "");
              setJobResponsibilities(intake.job?.responsibilities ?? ""); setJobRequirements(intake.job?.requirements ?? "");
            }} />
            <fieldset>
              <legend>候选人信息</legend>
              <p className="field-hint">可直接填写，也可上传简历回填。全文仅在勾选后上传，用于本次面试追问。</p>
              <input
                aria-label="上传简历"
                type="file"
                accept={documentAccept}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void loadDocument("resume", file);
                }}
                disabled={Boolean(extractingDocument)}
              />
              {resumeText && <label className="consent"><input type="checkbox" checked={resumeConsent} onChange={(e) => setResumeConsent(e.target.checked)} />允许在本次面试中使用简历全文（{resumeText.length} 字符），之后可删除全文索引</label>}
              {extractingDocument === "resume" && <p className="file-note">正在提取简历文本…</p>}
              <label htmlFor="candidate">姓名</label>
              <input
                id="candidate"
                value={candidateName}
                onChange={(event) => setCandidateName(event.target.value)}
                maxLength={100}
              />
              <label htmlFor="skills">技能</label>
              <input
                id="skills"
                value={skills}
                onChange={(event) => setSkills(event.target.value)}
                placeholder="用逗号分隔，例如 TypeScript, PostgreSQL"
                maxLength={4_000}
              />

              <div className="project-heading">
                <strong>项目经历</strong>
                <span>至少一个</span>
              </div>
              {projects.map((project, index) => <section className="project-card" key={project.key}>
                <div className="project-card-title">
                  <strong>项目 {index + 1}</strong>
                  {projects.length > 1 && <button
                    className="text-button"
                    type="button"
                    onClick={() => setProjects((current) => current.filter((item) => item.key !== project.key))}
                  >删除</button>}
                </div>
                <label htmlFor={`project-name-${project.key}`}>项目名称</label>
                <input
                  id={`project-name-${project.key}`}
                  value={project.name}
                  onChange={(event) => updateProject(project.key, "name", event.target.value)}
                  maxLength={160}
                />
                <label htmlFor={`project-description-${project.key}`}>项目经历</label>
                <textarea
                  id={`project-description-${project.key}`}
                  value={project.description}
                  onChange={(event) => updateProject(project.key, "description", event.target.value)}
                  placeholder="项目背景、你负责什么、怎么做、结果如何"
                  maxLength={8_000}
                  rows={5}
                />
              </section>)}
              <button className="add-button" type="button" onClick={() => setProjects((current) => [...current, emptyProject()])}>
                ＋ 添加项目
              </button>
            </fieldset>

            <fieldset disabled={extractingDocument === "job"}>
              <legend>Job Description（可选）</legend>
              <p className="field-hint">支持文本、文本型 PDF 和 JPG/PNG/WebP。图片在浏览器内识字，提取的文本发送给 LLM 填写以下四项，原图不上传。重新上传会替换这四项，请人工检查后使用。</p>
              <input
                aria-label="上传 Job Description"
                type="file"
                accept={documentAccept}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void loadDocument("job", file);
                }}
                disabled={Boolean(extractingDocument)}
              />
              {extractingDocument === "job" && <p className="file-note" role="status">正在提取文本并由 LLM 填写岗位信息…</p>}
              <label htmlFor="job-title">岗位</label>
              <input
                id="job-title"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="例如：数据平台工程师"
                maxLength={120}
              />
              <label htmlFor="job-introduction">岗位介绍</label>
              <textarea
                id="job-introduction"
                value={jobIntroduction}
                onChange={(event) => setJobIntroduction(event.target.value)}
                maxLength={8_000}
                rows={3}
              />
              <label htmlFor="job-responsibilities">职责</label>
              <textarea
                id="job-responsibilities"
                value={jobResponsibilities}
                onChange={(event) => setJobResponsibilities(event.target.value)}
                maxLength={12_000}
                rows={4}
              />
              <label htmlFor="job-requirements">要求</label>
              <textarea
                id="job-requirements"
                value={jobRequirements}
                onChange={(event) => setJobRequirements(event.target.value)}
                maxLength={12_000}
                rows={4}
              />
            </fieldset>

            <label htmlFor="time-budget">时长提醒</label>
            <select id="time-budget" value={timeBudget} onChange={(e) => setTimeBudget(Number(e.target.value))}>
              {[20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} 分钟</option>)}
            </select>
            <label htmlFor="max-turns">轮次上限</label>
            <input id="max-turns" type="number" min={5} max={50} step={1} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} required />
            <p className="field-hint">可以设置 5–50 轮交流。到时间会提醒你，聊满设定轮次后结束面试。</p>
            {importNotice && <p className="file-note success-note">{importNotice}</p>}

            <button
              onClick={createInterview}
              disabled={Boolean(busyAction) || Boolean(extractingDocument) || !candidateName.trim()
                || projects.some((project) => !project.name.trim() || !project.description.trim()) || jobIsIncomplete}
              aria-busy={busyAction === "create"}
            >
              {busyAction === "create" && <span className="spinner" aria-hidden="true" />}
              {busyAction === "create" ? "正在创建调查计划与索引…" : "创建面试 Session"}
            </button>
          </>}
          {interview?.status === "draft" && <>
            <code>{interview.sessionId}</code>
            <dl className="context">
              <div><dt>候选人</dt><dd>{interview.candidate.name}</dd></div>
              <div><dt>岗位</dt><dd>{interview.role.name}</dd></div>
              <div><dt>项目</dt><dd>{interview.intake.candidate.projects.length}</dd></div>
              <div><dt>JD</dt><dd>{interview.intake.job ? "已填写" : "未填写"}</dd></div>
            </dl>
            <button onClick={start} disabled={isProcessing} aria-busy={busyAction === "start"}>
              {busyAction === "start" && <span className="spinner" aria-hidden="true" />}
              {busyAction === "start" ? "启动中…" : "开始面试"}
            </button>
          </>}
          {interview?.status === "active" && <>
            <InterviewTimeReminder state={interview} />
            {interview.turns.length === 0 && <p className="opening">你好，{interview.candidate.name}。我们会围绕你的项目经历逐步交流，本次预算约 {interview.timeBudgetMinutes ?? 30} 分钟，最多 {interview.maxTurns ?? 15} 轮，时间到了只提醒。不清楚的内容可以直接说明，也可以请我解释或跳过。</p>}
            {interview.currentTransition && <p>{interview.currentTransition}</p>}
            {interview.currentClarification && <p className="clarification">{interview.currentClarification}</p>}
            {interview.currentAcknowledgement && <p>{interview.currentAcknowledgement}</p>}
            <p className="question">{interview.currentQuestion}</p>
            <label htmlFor="answer">你的回答</label>
            <textarea
              id="answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
              disabled={Boolean(pendingCommandId) || isProcessing}
              maxLength={10_000}
              rows={5}
            />
            <p className="field-hint">Enter 提交 · Shift + Enter 换行</p>
            {!interview.openFloor && <div className="actions"><button className="secondary" onClick={() => submit("clarify")}
              disabled={isProcessing || Boolean(pendingCommandId) || interview.clarifications?.some((item) => item.question === interview.currentQuestion)}>请解释这个问题</button>
              <button className="secondary" onClick={() => submit("skip")} disabled={isProcessing || Boolean(pendingCommandId)}>跳过这个问题</button></div>}
            {interview.openFloor && <button className="secondary" onClick={() => submit("finish")} disabled={isProcessing || Boolean(pendingCommandId)}>没有其他补充，结束面试</button>}
            <button onClick={() => submit()} disabled={!answer.trim() || isProcessing} aria-busy={busyAction === "submit"}>
              {busyAction === "submit" && <span className="spinner" aria-hidden="true" />}
              {busyAction === "submit" ? "提交中…" : pendingCommandId ? "重试提交" : "提交回答"}
            </button>
          </>}
          {interview?.status === "completed" && <>
            <p className="done">感谢你，{interview.candidate.name}。本次交流已结束，报告会整理你分享的内容和仍需核实的事项。你也可以补充一条项目事实。</p>
            <SupplementForm session={session!} onComplete={restore} />
          </>}
          {interview && isProcessing && <RunProgressPanel state={interview} key={run?.traceId ?? pendingCommandId ?? "pending"} run={busyAction === "start" && run?.operation !== "start" ? undefined : run}
            submitting={isProcessing} reconnecting={connection === "reconnecting"} />}
          {interview && interview.status !== "draft" && <TechnicalPanel key={interview.sessionId} state={interview} version={session!.stateVersion} rounds />}
          {connection === "reconnecting" && <p role="status">连接正在恢复，你的回答会保留。</p>}
          {error && <p className="error">{error}</p>}
        </article>}
        {backstage && interview && <article aria-label="面试后台">
          {interview && auditTab === "report" && <ReportPanel sessionId={interview.sessionId} version={session!.stateVersion} />}
          {interview && auditTab === "technical" && <>
        {runtime && <p className={`runtime ${runtime.mode}`}>
          <strong>{runtime.mode === "llm" ? "LLM 已连接" : "Demo 模式"}</strong>
          {runtime.mode === "llm" && (runtime.reportModelId || runtime.interviewModelId
            ? ` · ${runtime.provider} · Report=${runtime.reportModelId} · Interview=${runtime.interviewModelId}`
            : ` · ${runtime.provider}/${runtime.modelId}`)}
        </p>}
            {interview.rolePack && <p className="field-hint">已生成岗位调查计划 · {interview.rolePack.requirements.length} 条要求</p>}
            {interview.rolePackFailure && <p className="field-hint">{interview.rolePackFailure}</p>}
            {interview.resumeIndexFailure && <p className="field-hint">{interview.resumeIndexFailure}</p>}
            {Boolean(session?.resume?.chunkCount) && <div><p className="field-hint">{session?.resume?.resumeIndexed ? "简历全文可检索" : "简历索引未就绪"} · {session!.resume!.chunkCount} 个片段。删除索引不改写已接受的面试记录。</p>
              <button className="secondary" disabled={isProcessing} onClick={() => {
                void request(`/api/interviews/${interview.sessionId}/resume-index`, { method: "DELETE" }).then(() => request<InterviewStateResponse>(`/api/interviews/${interview.sessionId}/state`)).then(restore).catch((cause) => setError(cause.message));
              }}>删除简历全文索引</button></div>}
          <RunProgressPanel state={interview} run={run} submitting={busyAction === "submit" || busyAction === "start"} reconnecting={connection === "reconnecting"} />
            <TechnicalPanel state={interview} version={session!.stateVersion} />
          </>}
          {auditTab === "evidence" && <div className="evidence-panel">
          <span>02 / 面试进度</span>
          {progress && <section className="progress-panel">
            <div className="progress-title">
              <strong>{progress.coveragePercent}%</strong>
              <span>{progress.stage === "completed" ? "面试完成" : "证据覆盖"}</span>
            </div>
            <progress max="100" value={progress.coveragePercent} />
            <dl className="progress-grid">
              <div><dt>已聊到的项目</dt><dd>{progress.projects.covered}/{progress.projects.total}</dd></div>
              <div><dt>已聊到的话题</dt><dd>{progress.reportFields.covered}/{progress.reportFields.total}</dd></div>
              <div><dt>核心能力</dt><dd>{progress.coreCompetencies.covered}/{progress.coreCompetencies.total}</dd></div>
              <div><dt>轮次</dt><dd>{progress.turns.completed}/{progress.turns.max}</dd></div>
              <div><dt>待澄清矛盾</dt><dd>{progress.contradictionsOpen}</dd></div>
            </dl>
          </section>}
          <ul>
            {interview?.role.competencies.map((competency) => {
              const state = interview?.competencies.find((item) => item.competencyId === competency.id);
              return <li key={competency.id}>
                <strong>{competency.name}</strong>
                <meter min="0" max="100" value={state?.score ?? 0} />
                <small>{state?.score ?? "—"}</small>
              </li>;
            })}
          </ul>
          {interview && <ul>
            {interview.report.fields.map((field) => <li key={field.id}>
              <strong>{field.name}</strong>
              <small>{field.status}</small>
            </li>)}
          </ul>}
          {activeProject && <details className="audit">
            <summary>审核与运行 Trace</summary>
            <dl className="context">
              <div><dt>Project</dt><dd>{activeProject.name}</dd></div>
              <div><dt>Report field</dt><dd>{activeField?.name ?? "—"}</dd></div>
              <div><dt>Status</dt><dd>{activeField?.status ?? "—"}</dd></div>
              <div><dt>Decision</dt><dd>{latestTrace?.action ?? "—"}</dd></div>
              {latestTrace?.execution?.evidence && <div><dt>Evidence</dt><dd>
                {latestTrace.execution.evidence.source.toUpperCase()} · {latestTrace.execution.evidence.durationMs}ms
                {latestTrace.execution.evidence.retryCount > 0 && ` · retry ${latestTrace.execution.evidence.retryCount}`}
              </dd></div>}
              {latestTrace?.execution?.question && <div><dt>Question</dt><dd>
                {latestTrace.execution.question.source.toUpperCase()} · {latestTrace.execution.question.durationMs}ms
                {latestTrace.execution.question.retryCount > 0 && ` · retry ${latestTrace.execution.question.retryCount}`}
              </dd></div>}
              {latestTrace?.reason && <div><dt>Reason</dt><dd>{latestTrace.reason}</dd></div>}
            </dl>
          </details>}
          {interview?.evidence.map((item) => <blockquote key={item.id}>
            <strong>{item.polarity === "support" ? "✓" : "?"} {item.statement}</strong>
            <p>“{item.sourceQuote}”</p>
          </blockquote>)}
          </div>}
          <details className="session-tools"><summary>会话管理与下载</summary>
            <button className="secondary" onClick={() => void exportSession()}>导出会话记录 JSON</button>
            <button className="secondary" onClick={() => void downloadInterviewReport("json")}>
              下载{interview.status === "completed" ? "最终" : "当前"} Report JSON
            </button>
            <button className="secondary" onClick={() => void downloadInterviewReport("markdown")}>
              下载{interview.status === "completed" ? "最终" : "当前"} Report Markdown
            </button>
          {pilotMode && interview && <button className="secondary" onClick={exportPilotSession}>
            下载 Pilot Session JSON
          </button>}
          {interview && <button className="secondary" onClick={newInterview} disabled={isProcessing}>新建 Session</button>}
          </details>
      <HistoryPanel refreshKey={`${interview?.sessionId ?? ""}:${session?.stateVersion ?? ""}`} currentId={interview?.sessionId} disabled={isProcessing}
        onOpen={open} onDeleted={(id) => { if (id === interview?.sessionId) newInterview(); }} />
          {error && <p className="error">{error}</p>}
        </article>}
      </section>
      {!interview && <HistoryPanel refreshKey={`intake:${historyRefresh}`} disabled={isProcessing} onOpen={open} onDeleted={() => {}} />}

    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
