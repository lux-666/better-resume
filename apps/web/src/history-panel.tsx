import { useEffect, useState } from "react";
import type { SessionHistoryItem } from "@better-resume/api-contract";
import { request } from "./api.ts";
export function HistoryPanel({ refreshKey, currentId, disabled, onOpen, onDeleted }: { refreshKey: string; currentId?: string; disabled: boolean; onOpen: (id: string) => Promise<void>; onDeleted: (id: string) => void }) {
  const [items, setItems] = useState<SessionHistoryItem[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    let disposed = false;
    void request<{ sessions: SessionHistoryItem[] }>("/api/interviews").then((r) => { if (!disposed) { setItems(r.sessions); setError(""); } }).catch(() => { if (!disposed) setError("历史读取失败，可刷新重试"); });
    return () => { disposed = true; };
  }, [refreshKey, refresh]);
  async function remove(item: SessionHistoryItem) {
    if (!window.confirm(`删除 ${item.candidateName} 的这次会话及其报告、对话和索引？此操作无法撤销。`)) return;
    setWorking(true);
    try { await request(`/api/interviews/${item.sessionId}`, { method: "DELETE" }); onDeleted(item.sessionId); setRefresh((n) => n + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败"); }
    finally { setWorking(false); }
  }
  return <details className="history-panel"><summary>本地历史 · {items.length} 次会话</summary>
    <p className="field-hint">会话保存在本机数据库，持续保留，直到你主动删除。</p>
    <button className="secondary" disabled={working} onClick={() => setRefresh((n) => n + 1)}>刷新历史</button>
    {items.map((item) => <section className="history-row" key={item.sessionId}>
      <div><strong>{item.candidateName} · {item.roleName}</strong><p>{{ draft: "待开始", active: "进行中", completed: "已完成" }[item.status]} · {item.turnCount} 轮 · {new Date(item.updatedAt).toLocaleString()}</p><small>创建于 {new Date(item.createdAt).toLocaleString()}</small></div>
      <div className="actions"><button className="secondary" disabled={disabled || working || currentId === item.sessionId} onClick={() => {
        setWorking(true); void onOpen(item.sessionId).catch((cause) => setError(cause instanceof Error ? cause.message : "打开失败")).finally(() => setWorking(false));
      }}>{currentId === item.sessionId ? "当前会话" : "打开"}</button>
      <button className="text-button" disabled={disabled || working} onClick={() => void remove(item)}>删除</button></div>
    </section>)}
    {!items.length && <p>还没有历史会话。</p>}{error && <p className="error">{error}</p>}
  </details>;
}
