import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AnswerCommand,
  ApiError,
  InterviewStateResponse,
  InterviewStepResponse,
  RuntimeInfo,
} from "@better-resume/api-contract";
import "./style.css";

type Role = {
  id: string;
  name: string;
  competencies: Array<{ id: string; name: string; weight: number }>;
};

class ApiRequestError extends Error {
  constructor(message: string, readonly code: ApiError["code"], readonly retryable: boolean) {
    super(message);
  }
}

const sessionStorageKey = "better-resume-session-id";

type HealthResponse = { ok: boolean; runtime: RuntimeInfo };
type BusyAction = "create" | "start" | "submit";

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
  const [role, setRole] = useState<Role>();
  const [candidateName, setCandidateName] = useState("");
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
  const activeProject = interview?.candidate.projects.find((project) => project.status === "active");
  const activeTopic = activeProject?.topics.find((topic) => topic.status === "active");
  const openGap = activeTopic?.unresolvedGaps.find((gap) => gap.status === "open");
  const latestTrace = interview?.traces.at(-1);

  function restore(restored: InterviewStateResponse): void {
    setSession(restored);
    setPendingCommandId(restored.pendingCommand?.commandId ?? "");
    setAnswer(restored.pendingCommand?.answer ?? "");
  }

  useEffect(() => {
    request<HealthResponse>("/api/health")
      .then((health) => setServerRuntime(health.runtime))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "API 未启动"));
    fetch("/api/roles")
      .then((response) => {
        if (!response.ok) throw new Error("API 未启动");
        return response.json() as Promise<Role[]>;
      })
      .then(([firstRole]) => setRole(firstRole))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载失败"));
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
        const created = await post<InterviewStateResponse>("/api/interviews", { candidateName });
        setSession(created);
        localStorage.setItem(sessionStorageKey, created.state.sessionId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "创建失败");
      }
    });
  }

  function start(): void {
    if (!interview) return;
    void runOnce("start", async () => {
      try {
        setError("");
        setSession(await post<InterviewStepResponse>(`/api/interviews/${interview.sessionId}/start`));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "启动失败");
      }
    });
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
    <main>
      <header>
        <p className="eyebrow">EVIDENCE-DRIVEN INTERVIEW</p>
        <h1>Better Resume</h1>
        <p>从简历 Claim 出发，用可追溯证据判断真实岗位能力。</p>
        {runtime && <p className={`runtime ${runtime.mode}`}>
          <strong>{runtime.mode === "llm" ? "LLM 已连接" : "Demo 模式"}</strong>
          {runtime.mode === "llm" && ` · ${runtime.provider}/${runtime.modelId}`}
        </p>}
      </header>
      <section className="grid">
        <article>
          <span>01 / 面试</span>
          <h2>{role?.name ?? "正在读取岗位…"}</h2>
          {!interview && <>
            <label htmlFor="candidate">候选人姓名</label>
            <input
              id="candidate"
              value={candidateName}
              onChange={(event) => setCandidateName(event.target.value)}
              placeholder="可留空"
              maxLength={100}
            />
            <button onClick={createInterview} disabled={Boolean(busyAction)} aria-busy={busyAction === "create"}>
              {busyAction === "create" && <span className="spinner" aria-hidden="true" />}
              {busyAction === "create" ? "创建中…" : "创建面试 Session"}
            </button>
          </>}
          {interview?.status === "draft" && <>
            <code>{interview.sessionId}</code>
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
          {interview && <button className="secondary" onClick={newInterview} disabled={Boolean(busyAction)}>新建 Session</button>}
          {error && <p className="error">{error}</p>}
        </article>
        <article>
          <span>02 / 证据覆盖进度</span>
          {progress && <section className="progress-panel">
            <div className="progress-title">
              <strong>{progress.coveragePercent}%</strong>
              <span>{progress.stage === "completed" ? "面试完成" : "证据覆盖"}</span>
            </div>
            <progress max="100" value={progress.coveragePercent} />
            <dl className="progress-grid">
              <div><dt>Project</dt><dd>{progress.projects.covered}/{progress.projects.total}</dd></div>
              <div><dt>Topic</dt><dd>{progress.topics.covered}/{progress.topics.total}</dd></div>
              <div><dt>Gap</dt><dd>{progress.gaps.closed}/{progress.gaps.total}</dd></div>
              <div><dt>核心能力</dt><dd>{progress.coreCompetencies.covered}/{progress.coreCompetencies.total}</dd></div>
              <div><dt>轮次</dt><dd>{progress.turns.completed}/{progress.turns.max}</dd></div>
              <div><dt>待澄清矛盾</dt><dd>{progress.contradictionsOpen}</dd></div>
            </dl>
          </section>}
          <ul>
            {role?.competencies.map((competency) => {
              const state = interview?.competencies.find((item) => item.competencyId === competency.id);
              return <li key={competency.id}>
                <strong>{competency.name}</strong>
                <meter min="0" max="100" value={state?.score ?? 0} />
                <small>{state?.score ?? "—"}</small>
              </li>;
            })}
          </ul>
          {activeProject && <details className="audit">
            <summary>审核与运行 Trace</summary>
            <dl className="context">
              <div><dt>Project</dt><dd>{activeProject.name}</dd></div>
              <div><dt>Topic</dt><dd>{activeTopic?.name ?? "—"}</dd></div>
              <div><dt>Gap</dt><dd>{openGap?.description ?? "已解决"}</dd></div>
              <div><dt>Lead</dt><dd>{latestTrace?.selectedLead ?? "—"}</dd></div>
              <div><dt>Probe</dt><dd>{latestTrace?.selectedProbe ?? "—"}</dd></div>
              <div><dt>Decision</dt><dd>{latestTrace?.action ?? "—"}</dd></div>
              <div><dt>Skill</dt><dd>{latestTrace?.selectedSkill ?? "—"}</dd></div>
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
      <footer>Gap → Lead → Probe → Question → Evidence</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
