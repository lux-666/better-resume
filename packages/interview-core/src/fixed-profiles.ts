import {
  getActiveInterviewContext,
  type AnswerDisposition,
  type EvidenceProposal,
  type InterviewState,
} from "./index.ts";

export type FixedProfileName = "strong" | "weak" | "contradictory";

export const fixedProfiles: Record<FixedProfileName, { expectedTurns: number }> = {
  strong: { expectedTurns: 8 },
  weak: { expectedTurns: 8 },
  contradictory: { expectedTurns: 10 },
};

export function fixedProfileResponse(
  profile: FixedProfileName,
  state: InterviewState,
): { answer: string; disposition: AnswerDisposition; evidence: EvidenceProposal[] } {
  const { project, field } = getActiveInterviewContext(state);
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
  if (contradiction) {
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
