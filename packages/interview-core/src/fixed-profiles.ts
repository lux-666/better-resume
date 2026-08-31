import {
  getActiveInterviewContext,
  type AnswerDisposition,
  type EvidenceProposal,
  type InterviewState,
} from "./index.ts";

export type FixedProfileName = "strong" | "weak" | "contradictory";

export const fixedProfiles: Record<FixedProfileName, { expectedTurns: number }> = {
  strong: { expectedTurns: 6 },
  weak: { expectedTurns: 6 },
  contradictory: { expectedTurns: 8 },
};

export function fixedProfileResponse(
  profile: FixedProfileName,
  state: InterviewState,
): { answer: string; disposition: AnswerDisposition; evidence: EvidenceProposal[] } {
  const { project, topic, gap } = getActiveInterviewContext(state);
  const contradictionClaimId = gap.type.startsWith("contradiction:")
    ? gap.type.slice("contradiction:".length)
    : undefined;
  const claimIds = contradictionClaimId ? [contradictionClaimId] : project.claims
    .filter((claim) => claim.relatedCompetencies.includes(gap.competencyId))
    .filter((claim) => gap.type.includes("ownership")
      ? /负责|主导|设计|实现/.test(claim.text)
      : gap.type.includes("metric") ? /%|准确率|延迟|提升|降低/.test(claim.text) : true)
    .map((claim) => claim.id);

  let answer: string;
  let disposition: AnswerDisposition = "substantive";
  let polarity: EvidenceProposal["polarity"] = "support";
  if (contradictionClaimId) {
    answer = `准确说法是：我在“${project.name}”中只负责接口联调，没有主导整体设计。`;
    polarity = "weakness";
  } else if (profile === "contradictory" && gap.type.includes("ownership")) {
    answer = `简历表述不准确，“${project.name}”的核心设计并不是我完成的。`;
    disposition = "denial";
    polarity = "invalidate";
  } else if (profile === "weak") {
    polarity = "weakness";
    answer = gap.type.includes("ownership")
      ? `我在“${project.name}”中只按既定方案完成局部配置，没有做关键设计。`
      : gap.type.includes("metric")
        ? `我只看了“${project.name}”的总体趋势，没有保留基线、固定测试集或统计口径。`
        : `“${project.name}”的问题由同事定位，我只协助复现，没有独立完成根因分析。`;
  } else {
    answer = gap.type.includes("ownership")
      ? `我独立负责“${project.name}”的核心设计、实现和上线验证，并记录了关键决策。`
      : gap.type.includes("metric")
        ? `“${project.name}”使用固定测试集，按成功请求占比统计，并与同流量基线做了对照。`
        : `“${project.name}”曾出现线上故障，我通过日志定位根因，修复后补了回归和告警。`;
  }

  return {
    answer,
    disposition,
    evidence: [{
      claimIds,
      competencyId: gap.competencyId,
      statement: `${profile} profile 对“${topic.name}”提供了可追溯回答。`,
      polarity,
      strength: profile === "strong" ? 0.9 : 0.45,
      specificity: 0.9,
      evaluatorConfidence: 0.9,
      sourceQuote: answer,
    }],
  };
}
