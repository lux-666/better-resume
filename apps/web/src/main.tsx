import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AnswerCommand,
  ApiError,
  InterviewStateResponse,
  InterviewStepResponse,
} from "@better-resume/api-contract";
import "./style.css";

type Role = {
  id: string;
  name: string;
  competencies: Array<{ id: string; name: string; weight: number }>;
};

async function post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as T | ApiError;
  if (!response.ok) throw new Error((value as ApiError).message ?? "请求失败");
  return value as T;
}

function App() {
  const [role, setRole] = useState<Role>();
  const [candidateName, setCandidateName] = useState("");
  const [session, setSession] = useState<InterviewStateResponse>();
  const [answer, setAnswer] = useState("");
  const [pendingCommandId, setPendingCommandId] = useState("");
  const [error, setError] = useState("");
  const interview = session?.state;
  const activeProject = interview?.candidate.projects.find((project) => project.status === "active");
  const activeTopic = activeProject?.topics.find((topic) => topic.status === "active");
  const openGap = activeTopic?.unresolvedGaps.find((gap) => gap.status === "open");
  const latestTrace = interview?.traces.at(-1);

  useEffect(() => {
    fetch("/api/roles")
      .then((response) => {
        if (!response.ok) throw new Error("API 未启动");
        return response.json() as Promise<Role[]>;
      })
      .then(([firstRole]) => setRole(firstRole))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载失败"));
  }, []);

  async function createInterview() {
    try {
      setError("");
      setSession(await post<InterviewStateResponse>("/api/interviews", { candidateName }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败");
    }
  }

  async function start() {
    if (!interview) return;
    try {
      setError("");
      setSession(await post<InterviewStepResponse>(`/api/interviews/${interview.sessionId}/start`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "启动失败");
    }
  }

  async function submit() {
    if (!interview || !session?.questionId || !answer.trim()) return;
    const commandId = pendingCommandId || crypto.randomUUID();
    if (!pendingCommandId) setPendingCommandId(commandId);
    try {
      setError("");
      const command: AnswerCommand = {
        commandId,
        questionId: session.questionId,
        expectedStateVersion: session.stateVersion,
        answer,
      };
      const step = await post<InterviewStepResponse>(`/api/interviews/${interview.sessionId}/answer`, command);
      setSession(step);
      setAnswer("");
      setPendingCommandId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败");
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">EVIDENCE-DRIVEN INTERVIEW</p>
        <h1>Better Resume</h1>
        <p>从简历 Claim 出发，用可追溯证据判断真实岗位能力。</p>
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
            <button onClick={createInterview}>创建 Demo Session</button>
          </>}
          {interview?.status === "draft" && <>
            <code>{interview.sessionId}</code>
            <button onClick={start}>开始面试</button>
          </>}
          {interview?.status === "active" && <>
            {interview.currentAcknowledgement && <p>{interview.currentAcknowledgement}</p>}
            <p className="question">{interview.currentQuestion}</p>
            <label htmlFor="answer">你的回答</label>
            <textarea
              id="answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={Boolean(pendingCommandId)}
              maxLength={10_000}
              rows={5}
            />
            <button onClick={submit} disabled={!answer.trim()}>
              {pendingCommandId ? "重试提交" : "提交回答"}
            </button>
          </>}
          {interview?.status === "completed" && <p className="done">本轮证据采集完成。</p>}
          {error && <p className="error">{error}</p>}
        </article>
        <article>
          <span>02 / 实时证据</span>
          {activeProject && <dl className="context">
            <div><dt>Project</dt><dd>{activeProject.name}</dd></div>
            <div><dt>Topic</dt><dd>{activeTopic?.name ?? "—"}</dd></div>
            <div><dt>Gap</dt><dd>{openGap?.description ?? "已解决"}</dd></div>
            <div><dt>Decision</dt><dd>{latestTrace?.action ?? "—"}</dd></div>
            <div><dt>Skill</dt><dd>{latestTrace?.selectedSkill ?? "—"}</dd></div>
            {latestTrace?.reason && <div><dt>Reason</dt><dd>{latestTrace.reason}</dd></div>}
          </dl>}
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
          {interview?.evidence.map((item) => <blockquote key={item.id}>
            <strong>{item.polarity === "support" ? "✓" : "?"} {item.statement}</strong>
            <p>“{item.sourceQuote}”</p>
          </blockquote>)}
        </article>
      </section>
      <footer>Project → Topic → Evidence Gap → Skill → Question → Evidence</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
