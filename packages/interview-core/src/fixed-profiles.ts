import {
  getActiveInterviewContext,
  type AnswerDisposition,
  type EvidenceProposal,
  type InterviewState,
} from "./index.ts";

export type FixedProfileName = "strong" | "weak" | "contradictory";
export type ModelProfileName = FixedProfileName | "multi_field" | "vertical_depth" | "evasive";

export const fixedProfiles: Record<FixedProfileName, { expectedTurns: number }> = {
  strong: { expectedTurns: 8 },
  weak: { expectedTurns: 8 },
  contradictory: { expectedTurns: 10 },
};

export const modelProfiles: Record<ModelProfileName, { maxTurns: number }> = {
  strong: { maxTurns: 15 },
  weak: { maxTurns: 15 },
  contradictory: { maxTurns: 15 },
  multi_field: { maxTurns: 15 },
  vertical_depth: { maxTurns: 15 },
  evasive: { maxTurns: 15 },
};

const strongAnswers: Record<string, string> = {
  "project_enterprise_rag:ownership": "我独立设计并实现了企业 RAG 的分块、召回、融合和 rerank 链路，也负责上线验证；同事只提供业务文档和部署平台支持。",
  "project_enterprise_rag:mechanism": "我让 BM25 和 BGE dense retrieval 各召回 50 条，再用 RRF 融合并 rerank 到 20 条；没有用加权分数融合，因为两路 score 难以稳定校准。",
  "project_enterprise_rag:measurement": "我用同一批 200 条人工标注问题做离线对照，回答准确率从 70% 提升到 85%，即提高 15 个百分点，判定规则和测试集在上线前固定。",
  "project_enterprise_rag:failure": "短商品名查询曾经召回为空；我从检索日志定位到 dense 对短词匹配不足，加入 BM25 后 Recall@20 从 76% 升到 84%，并补了短查询回归集和空召回告警。",
  "project_service_agent:ownership": "我主导客服 Agent 的状态机、工具编排和人工升级设计，亲自实现核心 TypeScript 工作流；业务团队只提供接口和升级规则。",
  "project_service_agent:mechanism": "工作流按受理、意图识别、工具执行、结果校验和人工升级显式转移；工具超时只重试一次，仍失败就保留上下文转人工，写操作使用幂等键。",
  "project_service_agent:measurement": "我在相同 20 RPS 和同一批 500 条请求下对照，平均响应延迟从 1200ms 降到 840ms，下降 30%，同时确认成功率没有下降。",
  "project_service_agent:failure": "支付查询工具曾因超时重试造成重复调用；我用 traceId 定位到缺少幂等保护，加入请求幂等键后用 100 条故障注入回归验证，并增加重复调用告警。",
};

export function fixedProfileResponse(
  profile: ModelProfileName,
  state: InterviewState,
): { answer: string; disposition: AnswerDisposition; evidence: EvidenceProposal[] } {
  const { project, field } = getActiveInterviewContext(state);
  const projectFields = state.report.fields.filter((item) => item.projectId === project.id);
  const projectTurns = state.turns.filter((turn) => turn.projectId === project.id);
  const contradiction = state.report.contradictions.find((item) =>
    item.projectId === project.id && item.status === "open"
  );
  const claimIds = contradiction ? [contradiction.claimId] : project.claims.filter((claim) =>
    field.id.endsWith(":ownership") ? /负责|主导|设计|实现/.test(claim.text)
      : field.id.endsWith(":measurement") ? /%|准确率|延迟|提升|降低/.test(claim.text)
        : false
  ).map((claim) => claim.id);

  let answer: string;
  let disposition: AnswerDisposition = "substantive";
  let polarity: EvidenceProposal["polarity"] = "support";
  if (profile === "multi_field") {
    answer = project.id === "project_enterprise_rag"
      ? "我负责召回架构，用 BM25 和 dense 各取 50 条后通过 RRF 融合；固定测试集上的 Recall@20 提升 8%，一次排序异常也由我通过日志定位并补了回归。"
      : "我负责工作流设计，用显式状态转换管理工具调用和人工升级；固定压测下延迟降低 30%，超时故障由我定位后增加了回退和告警。";
    return {
      answer,
      disposition,
      evidence: projectFields.filter((item) => item.status === "missing").map((item) => ({
        reportFieldIds: [item.id],
        claimIds: item.id.endsWith(":ownership") ? [project.claims[0].id]
          : item.id.endsWith(":measurement") ? [project.claims[1].id] : [],
        competencyId: item.competencyId,
        statement: `multi_field profile 对 ${item.name} 提供了可追溯回答。`,
        polarity: "support",
        strength: 0.9,
        specificity: 0.9,
        evaluatorConfidence: 0.9,
        sourceQuote: answer,
      })),
    };
  }
  if (profile === "evasive" && projectTurns.length === 0) {
    return { answer: "我更想聊一下最近的天气。", disposition: "irrelevant", evidence: [] };
  }
  if (profile === "evasive") {
    answer = "具体细节记不清了，只记得当时感觉效果更好。";
    disposition = "vague";
    polarity = "weakness";
  } else if (profile === "vertical_depth" && project.id === "project_enterprise_rag" && projectTurns.length === 0) {
    answer = "我负责召回模块，最初只用 dense retrieval，后来针对短查询加入 BM25，形成 hybrid search。";
  } else if (profile === "vertical_depth" && project.id === "project_enterprise_rag"
    && projectTurns.some((turn) => /hybrid search/i.test(turn.answer))
    && !projectTurns.some((turn) => /RRF/.test(turn.answer))) {
    answer = "BM25 和 embedding 各召回 50 条，再通过 RRF 融合，避免直接校准两类 score。";
  } else if (profile === "vertical_depth" && project.id === "project_enterprise_rag"
    && projectTurns.some((turn) => /RRF/.test(turn.answer))
    && !projectTurns.some((turn) => /top-50/.test(turn.answer))) {
    answer = "top-50 是离线比较 20、50、100 后选的，50 的 Recall@20 已接近 100，但延迟低了 18ms。";
  } else if (contradiction) {
    answer = `准确说法是：我在“${project.name}”中只负责接口联调，没有主导整体设计。`;
    polarity = "weakness";
  } else if (profile === "contradictory" && field.id.endsWith(":ownership")) {
    answer = `简历表述不准确，“${project.name}”的核心设计并不是我完成的。`;
    disposition = "denial";
    polarity = "invalidate";
  } else if (profile === "weak") {
    polarity = "weakness";
    answer = field.id.endsWith(":ownership")
      ? `我在“${project.name}”中只按既定方案完成局部配置，没有做关键设计。`
      : field.id.endsWith(":mechanism")
        ? `具体机制是同事确定的，我只知道用了现成组件。`
        : field.id.endsWith(":measurement")
          ? `我只看了总体趋势，没有保留基线、固定测试集或统计口径。`
          : `问题由同事定位，我只协助复现，没有独立完成根因分析。`;
  } else if (profile === "strong") {
    answer = strongAnswers[field.id];
  } else {
    answer = field.id.endsWith(":ownership")
      ? `我独立负责“${project.name}”的核心设计、实现和上线验证，并记录了关键决策。`
      : field.id.endsWith(":mechanism")
        ? `我把主流程拆成可观测步骤，明确了状态转换、失败回退和组件边界。`
        : field.id.endsWith(":measurement")
          ? `使用固定测试集，按成功请求占比统计，并与同流量基线做了对照。`
          : `曾出现线上故障，我通过日志定位根因，修复后补了回归和告警。`;
  }

  return {
    answer,
    disposition,
    evidence: [{
      reportFieldIds: [field.id],
      claimIds,
      competencyId: field.competencyId,
      statement: `${profile} profile 对 ${field.name} 提供了可追溯回答。`,
      polarity,
      strength: profile === "strong" ? 0.9 : 0.45,
      specificity: 0.9,
      evaluatorConfidence: 0.9,
      sourceQuote: answer,
    }],
  };
}
