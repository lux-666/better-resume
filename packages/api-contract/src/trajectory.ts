import type { AgentStep, TelemetryTrace } from "./telemetry.ts";

const labels: Record<string, [string, string]> = {
  report_agent: ["整理候选人回答", "正在分析你的项目经历"],
  interview_agent: ["准备下一轮交流", "正在选择下一轮追问方向"],
  narrative_agent: ["撰写评估报告", "正在整理你的评估报告"],
  read_report: ["读取已有报告", "正在查看已聊过的内容"],
  edit_report: ["核验回答中的事实", "正在核对回答与报告中的信息"],
  apply_report_edit: ["更新候选人画像", "正在把本轮回答整理进报告"],
  summary_update: ["整理面试记忆", "正在梳理前面聊过的内容"],
  retrieve_probe_knowledge: ["检索相关知识", "正在查找相关能力验证问题"],
  recall: ["回顾相关经历", "正在回顾你之前分享的相关经历"],
  ask_candidate: ["检查下一轮追问", "正在检查追问是否清晰、贴合你的经历"],
  finish_interview: ["检查面试收尾条件", "正在确认是否还有需要展开的话题"],
  apply_decision: ["确定下一步交流", "正在确定下一步交流安排"],
  clarify_candidate: ["解释当前问题", "正在说明这个问题的含义"],
  record_clarification: ["保留问题说明", "正在保存问题说明"],
  respond_to_candidate: ["回应你的补充或提问", "正在回应你想聊的内容"],
  add_candidate_topic: ["加入补充经历", "正在把你补充的经历加入交流"],
  record_discussion: ["保留开放交流内容", "正在保存这次交流"],
  record_supplement: ["整理补充事实", "正在整理你补充的项目事实"],
  activate_interview: ["开始面试", "正在准备本次面试"],
  fallback_model: ["切换备用模型", "正在尝试备用模型"],
};

// Only product labels and execution metadata enter the candidate stream, never tool inputs or model reasoning.
export function projectAgentSteps(trace: TelemetryTrace, now: number): AgentStep[] {
  const spans = new Map(trace.spans.map((span) => [span.spanId, span]));
  const visible = trace.spans.filter((span) => span.kind !== "embedding" && !(span.kind === "retrieval" && span.parentSpanId && spans.get(span.parentSpanId)?.kind === "tool"));
  const visibleIds = new Set(visible.map((span) => span.spanId));
  return visible.map((span): AgentStep => {
    let parent = span.parentSpanId ? spans.get(span.parentSpanId) : undefined;
    const visited = new Set([span.spanId]);
    while (parent && !visited.has(parent.spanId) && !visibleIds.has(parent.spanId)) {
      visited.add(parent.spanId); parent = parent.parentSpanId ? spans.get(parent.parentSpanId) : undefined;
    }
    const key = span.toolName ?? span.operation;
    const pair = span.kind === "model"
      ? parent?.operation === "report_agent" ? ["分析回答并整理报告", "正在思考如何补充报告"]
        : parent?.operation === "interview_agent" ? ["推敲下一步交流", "正在结合你的回答准备下一步交流"]
        : ["组织报告内容", "正在组织报告内容"]
      : key.startsWith("persist") ? ["保存本轮面试结果", "正在保存本轮面试结果"]
        : labels[key] ?? ["处理面试信息", "正在处理面试信息"];
    const retrieval = span.kind === "tool" ? trace.spans.find((child) => child.parentSpanId === span.spanId && child.retrieval) : span;
    const fallback = span.status === "succeeded" && Boolean(retrieval?.retrieval?.fallback);
    return {
      id: span.spanId, ...(parent && !visited.has(parent.spanId) ? { parentId: parent.spanId } : {}),
      label: fallback ? "知识检索不可用，改用已有追问策略" : pair[0], runningLabel: pair[1],
      status: fallback ? "fallback" : span.outcome === "rejected" ? "rejected" : span.status ?? "interrupted",
      elapsedMs: span.durationMs ?? Math.max(0, now - Date.parse(span.startedAt)),
      ...(span.attempt ? { attempt: span.attempt } : {}),
    };
  });
}
