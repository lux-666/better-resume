import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Role = {
  id: string;
  name: string;
  competencies: Array<{ id: string; name: string; weight: number }>;
};

function App() {
  const [role, setRole] = useState<Role>();
  const [candidateName, setCandidateName] = useState("");
  const [sessionId, setSessionId] = useState("");
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
    setError("");
    const response = await fetch("/api/interviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidateName }),
    });
    const body = (await response.json()) as { sessionId?: string; error?: string };
    if (!response.ok) return setError(body.error ?? "创建失败");
    setSessionId(body.sessionId ?? "");
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
          <span>01 / 创建面试</span>
          <h2>{role?.name ?? "正在读取岗位…"}</h2>
          <label htmlFor="candidate">候选人姓名</label>
          <input
            id="candidate"
            value={candidateName}
            onChange={(event) => setCandidateName(event.target.value)}
            placeholder="可留空"
            maxLength={100}
          />
          <button onClick={createInterview}>创建 Session</button>
          {sessionId && <code>{sessionId}</code>}
          {error && <p className="error">{error}</p>}
        </article>
        <article>
          <span>02 / 能力模型</span>
          <ul>
            {role?.competencies.map((competency) => (
              <li key={competency.id}>
                <strong>{competency.name}</strong>
                <meter min="0" max="0.2" value={competency.weight} />
                <small>{Math.round(competency.weight * 100)}%</small>
              </li>
            ))}
          </ul>
        </article>
      </section>
      <footer>Project → Topic → Evidence Gap → Skill → Question → Evidence</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
