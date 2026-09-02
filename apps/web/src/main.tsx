import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AnswerCommand,
  ApiError,
  InterviewStateResponse,
  InterviewStepResponse,
  RuntimeInfo,
} from "@better-resume/api-contract";
import { parseJobDescription, parseResume } from "./intake-parser.ts";
import "./style.css";

class ApiRequestError extends Error {
  constructor(message: string, readonly code: ApiError["code"], readonly retryable: boolean) {
    super(message);
  }
}

const sessionStorageKey = "better-resume-session-id";
const pilotMode = new URLSearchParams(window.location.search).get("pilot") === "1";
const pilotStartedAtKey = (sessionId: string) => `better-resume-pilot-started-at:${sessionId}`;

type HealthResponse = { ok: boolean; runtime: RuntimeInfo };
type BusyAction = "create" | "start" | "submit";
type ProjectForm = {
  key: string;
  name: string;
  description: string;
};
type ExtractedDocument = { fileName: string; text: string };

const maximumDocumentCharacters = 100_000;
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
        pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      }
    } finally {
      await loadingTask.destroy();
    }
    text = pages.join("\n");
  } else if (/^text\//.test(mediaType) || /\.(txt|md|markdown|csv|json)$/i.test(file.name)) {
    text = await file.text();
  } else {
    throw new Error("当前只支持文本文件、Markdown 和文本型 PDF");
  }
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("文件中没有提取到文本；扫描版 PDF 暂不支持 OCR");
  if (normalized.length > maximumDocumentCharacters) throw new Error("提取后的文本不能超过 100,000 字符");
  return { fileName: file.name, text: normalized };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const value = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const error = value as ApiError;
    throw new ApiRequestError(error.message ?? "请求失败", error.code, error.retryable ?? false);
  }
  return value as T;
}

const post = <T,>(path: string, body: Record<string, unknown> = {}) => request<T>(path, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function App() {
  const [candidateName, setCandidateName] = useState("");
  const [skills, setSkills] = useState("");
  const [projects, setProjects] = useState<ProjectForm[]>([emptyProject()]);
  const [jobTitle, setJobTitle] = useState("");
  const [jobIntroduction, setJobIntroduction] = useState("");
  const [jobResponsibilities, setJobResponsibilities] = useState("");
  const [jobRequirements, setJobRequirements] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [extractingDocument, setExtractingDocument] = useState<"resume" | "job">();
  const [session, setSession] = useState<InterviewStateResponse>();
  const [answer, setAnswer] = useState("");
  const [pendingCommandId, setPendingCommandId] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>();
  const busyRef = useRef(false);
  const [error, setError] = useState("");
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

  function restore(restored: InterviewStateResponse): void {
    setSession(restored);
    setPendingCommandId(restored.pendingCommand?.commandId ?? "");
    setAnswer(restored.pendingCommand?.answer ?? "");
  }

  useEffect(() => {
    request<HealthResponse>("/api/health")
      .then((health) => setServerRuntime(health.runtime))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "API 未启动"));
    const sessionId = localStorage.getItem(sessionStorageKey);
    if (sessionId) {
      request<InterviewStateResponse>(`/api/interviews/${sessionId}/state`)
        .then(restore)
        .catch((cause: unknown) => {
          if (cause instanceof ApiRequestError && cause.code === "NOT_FOUND") {
            localStorage.removeItem(sessionStorageKey);
          } else {
            setError(cause instanceof Error ? cause.message : "恢复失败");
          }
        });
    }
  }, []);

  function newInterview(): void {
    if (busyRef.current) return;
    localStorage.removeItem(sessionStorageKey);
    setSession(undefined);
    setCandidateName("");
    setSkills("");
    setProjects([emptyProject()]);
    setJobTitle("");
    setJobIntroduction("");
    setJobResponsibilities("");
    setJobRequirements("");
    setImportNotice("");
    setAnswer("");
    setPendingCommandId("");
    setError("");
  }

  async function runOnce(action: BusyAction, operation: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyAction(action);
    try {
      await operation();
    } finally {
      busyRef.current = false;
      setBusyAction(undefined);
    }
  }

  function createInterview(): void {
    void runOnce("create", async () => {
      try {
        setError("");
        if (!candidateName.trim()) throw new Error("请填写候选人姓名");
        if (projects.length === 0 || projects.some((project) => !project.name.trim() || !project.description.trim())) {
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
          ...(hasJobInput ? {
            job: {
              title: jobTitle.trim(),
              introduction: jobIntroduction.trim(),
              responsibilities: jobResponsibilities.trim(),
              requirements: jobRequirements.trim(),
            },
          } : {}),
        });
        setSession(created);
        localStorage.setItem(sessionStorageKey, created.state.sessionId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "创建失败");
      }
    });
  }

  async function loadDocument(kind: "resume" | "job", file?: File): Promise<void> {
    if (!file) return;
    setExtractingDocument(kind);
    setError("");
    try {
      const extracted = await extractTextDocument(file);
      if (kind === "resume") {
        const parsed = parseResume(extracted.text);
        setCandidateName((current) => current.trim() ? current : parsed.name ?? "");
        setSkills((current) => current.trim() ? current : parsed.skills.join(", "));
        setProjects((current) => {
          const currentIsBlank = current.length === 1 && Object.entries(current[0])
            .filter(([key]) => key !== "key").every(([, value]) => !value);
          const imported = parsed.projects.map((project) => ({ ...project, key: crypto.randomUUID() }));
          return currentIsBlank ? imported : [...current, ...imported];
        });
        setImportNotice(`已从 ${extracted.fileName} 回填候选人信息；原始文件内容未保存。`);
      } else {
        const parsed = parseJobDescription(extracted.text);
        setJobTitle((current) => current.trim() ? current : parsed.title ?? "");
        setJobIntroduction((current) => current.trim() ? current : parsed.introduction ?? "");
        setJobResponsibilities((current) => current.trim() ? current : parsed.responsibilities ?? "");
        setJobRequirements((current) => current.trim() ? current : parsed.requirements ?? "");
        setImportNotice(`已从 ${extracted.fileName} 回填岗位信息；原始文件内容未保存。`);
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

  function start(): void {
    if (!interview) return;
    void runOnce("start", async () => {
      try {
        setError("");
        const started = await post<InterviewStepResponse>(`/api/interviews/${interview.sessionId}/start`);
        setSession(started);
        if (pilotMode && !localStorage.getItem(pilotStartedAtKey(interview.sessionId))) {
          localStorage.setItem(pilotStartedAtKey(interview.sessionId), new Date().toISOString());
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "启动失败");
      }
    });
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

  function submit(): void {
    const questionId = session?.questionId;
    if (!interview || !session || !questionId || !answer.trim()) return;
    void runOnce("submit", async () => {
      const commandId = pendingCommandId || crypto.randomUUID();
      if (!pendingCommandId) setPendingCommandId(commandId);
      try {
        setError("");
        const command: AnswerCommand = {
          commandId,
          questionId,
          expectedStateVersion: session.stateVersion,
          answer,
        };
        const step = await post<InterviewStepResponse>(`/api/interviews/${interview.sessionId}/answer`, command);
        setSession(step);
        setAnswer("");
        setPendingCommandId("");
      } catch (cause) {
        if (cause instanceof ApiRequestError && cause.code === "STATE_CONFLICT") {
          try {
            restore(await request<InterviewStateResponse>(`/api/interviews/${interview.sessionId}/state`));
          } catch {
            if (!cause.retryable) setPendingCommandId("");
          }
        } else if (cause instanceof ApiRequestError && !cause.retryable) {
          setPendingCommandId("");
        }
        setError(cause instanceof Error ? cause.message : "提交失败");
      }
    });
  }

  return (
    <main className={pilotMode && interview?.status === "active" ? "pilot-mode pilot-active" : undefined}>
      <header>
        <p className="eyebrow">EVIDENCE-DRIVEN INTERVIEW</p>
        <h1>Better Resume</h1>
        <p>从简历 Claim 出发，用可追溯证据判断真实岗位能力。</p>
        {runtime && <p className={`runtime ${runtime.mode}`}>
          <strong>{runtime.mode === "llm" ? "LLM 已连接" : "Demo 模式"}</strong>
          {runtime.mode === "llm" && (runtime.reportModelId || runtime.interviewModelId
            ? ` · ${runtime.provider} · Report=${runtime.reportModelId} · Interview=${runtime.interviewModelId}`
            : ` · ${runtime.provider}/${runtime.modelId}`)}
        </p>}
      </header>
      <section className="grid">
        <article>
          <span>01 / 面试</span>
          <h2>{interview?.role.name ?? "创建候选人档案"}</h2>
          {!interview && <>
            <fieldset>
              <legend>候选人信息</legend>
              <p className="field-hint">可直接填写，也可先上传简历自动回填；解析后只保留下面的结构化字段。</p>
              <input
                aria-label="上传简历"
                type="file"
                accept=".txt,.md,.markdown,.csv,.json,.pdf,text/plain,text/markdown,application/pdf"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void loadDocument("resume", file);
                }}
                disabled={Boolean(extractingDocument)}
              />
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

            <fieldset>
              <legend>Job Description（可选）</legend>
              <p className="field-hint">上传后自动拆到岗位、岗位介绍、职责和要求；原始 JD 不进入 Session。</p>
              <input
                aria-label="上传 Job Description"
                type="file"
                accept=".txt,.md,.markdown,.csv,.json,.pdf,text/plain,text/markdown,application/pdf"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void loadDocument("job", file);
                }}
                disabled={Boolean(extractingDocument)}
              />
              {extractingDocument === "job" && <p className="file-note">正在提取 Job Description…</p>}
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

            {importNotice && <p className="file-note success-note">{importNotice}</p>}

            <button
              onClick={createInterview}
              disabled={Boolean(busyAction) || Boolean(extractingDocument) || !candidateName.trim()
                || projects.some((project) => !project.name.trim() || !project.description.trim()) || jobIsIncomplete}
              aria-busy={busyAction === "create"}
            >
              {busyAction === "create" && <span className="spinner" aria-hidden="true" />}
              {busyAction === "create" ? "创建中…" : "创建面试 Session"}
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
            <button onClick={start} disabled={Boolean(busyAction)} aria-busy={busyAction === "start"}>
              {busyAction === "start" && <span className="spinner" aria-hidden="true" />}
              {busyAction === "start" ? "启动中…" : "开始面试"}
            </button>
          </>}
          {interview?.status === "active" && <>
            {interview.currentAcknowledgement && <p>{interview.currentAcknowledgement}</p>}
            <p className="question">{interview.currentQuestion}</p>
            <label htmlFor="answer">你的回答</label>
            <textarea
              id="answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={Boolean(pendingCommandId) || Boolean(busyAction)}
              maxLength={10_000}
              rows={5}
            />
            <button onClick={submit} disabled={!answer.trim() || Boolean(busyAction)} aria-busy={busyAction === "submit"}>
              {busyAction === "submit" && <span className="spinner" aria-hidden="true" />}
              {busyAction === "submit" ? "提交中…" : pendingCommandId ? "重试提交" : "提交回答"}
            </button>
          </>}
          {interview?.status === "completed" && <p className="done">本轮证据采集完成。</p>}
          {pilotMode && interview && <button className="secondary" onClick={exportPilotSession}>
            下载 Pilot Session JSON
          </button>}
          {interview && <button className="secondary" onClick={newInterview} disabled={Boolean(busyAction)}>新建 Session</button>}
          {error && <p className="error">{error}</p>}
        </article>
        <article>
          {pilotMode && interview?.status === "active" && <section className="pilot-lock">
            <span>02 / 面试后审核</span>
            <h2>本轮完成后开放</h2>
            <p>面试过程中不要查看 Report、Evidence 或 Agent Trace，避免这些内部信息影响你的回答与体验评分。</p>
          </section>}
          <span>02 / 证据覆盖进度</span>
          {progress && <section className="progress-panel">
            <div className="progress-title">
              <strong>{progress.coveragePercent}%</strong>
              <span>{progress.stage === "completed" ? "面试完成" : "证据覆盖"}</span>
            </div>
            <progress max="100" value={progress.coveragePercent} />
            <dl className="progress-grid">
              <div><dt>Project</dt><dd>{progress.projects.covered}/{progress.projects.total}</dd></div>
              <div><dt>Report</dt><dd>{progress.reportFields.covered}/{progress.reportFields.total}</dd></div>
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
        </article>
      </section>
      <footer>Report → Investigate → Ask → Grounded edit → Finish</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
