import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Role = {
  id: string;
  name: string;
  competencies: Array<{ id: string; name: string; weight: number }>;
};

type InterviewState = {
  sessionId: string;
  status: "draft" | "active" | "completed";
  currentQuestion?: string;
  evidence: Array<{ id: string; statement: string; sourceQuote: string; polarity: string }>;
  competencies: Array<{ competencyId: string; score?: number; confidence: number }>;
};

type InterviewStep = { state: InterviewState; question?: string };

async function post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? "请求失败");
  return value;
}

function App() {
  const [role, setRole] = useState<Role>();
  const [candidateName, setCandidateName] = useState("");
  const [interview, setInterview] = useState<InterviewState>();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

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
      setInterview(await post<InterviewState>("/api/interviews", { candidateName }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败");
    }
  }

  async function start() {
    if (!interview) return;
    try {
      setError("");
      const step = await post<InterviewStep>(`/api/interviews/${interview.sessionId}/start`);
      setInterview(step.state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "启动失败");
    }
  }

  async function submit() {
    if (!interview || !answer.trim()) return;
    try {
      setError("");
      const step = await post<InterviewStep>(`/api/interviews/${interview.sessionId}/answer`, { answer });
      setInterview(step.state);
      setAnswer("");
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
            <p className="question">{interview.currentQuestion}</p>
            <label htmlFor="answer">你的回答</label>
            <textarea
              id="answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={10_000}
              rows={5}
            />
            <button onClick={submit} disabled={!answer.trim()}>提交回答</button>
          </>}
          {interview?.status === "completed" && <p className="done">本轮证据采集完成。</p>}
          {error && <p className="error">{error}</p>}
        </article>
        <article>
          <span>02 / 实时证据</span>
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
