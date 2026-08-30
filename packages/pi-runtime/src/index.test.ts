import assert from "node:assert/strict";
import test from "node:test";
import { validateEvidenceExtraction } from "./index.ts";

const proposal = (
  sourceQuote: string,
  polarity: "support" | "weakness" | "invalidate",
) => ({
  evidence: [{
    claimIds: ["claim_ownership"],
    competencyId: "software_engineering",
    statement: "候选人的回答提供了可审计信息。",
    polarity,
    strength: 0.7,
    specificity: 0.8,
    evaluatorConfidence: 0.75,
    sourceQuote,
  }],
});

test("accepts the evidence contract corpus", () => {
  const cases = [
    ["我独立实现了召回模块。", "我独立实现了召回模块。", "support"],
    ["记不太清具体分工。", "记不太清具体分工。", "weakness"],
    ["这个模块不是我做的。", "不是我做的", "weakness"],
    ["我先说独立完成，但实际由同事实现。", "实际由同事实现", "invalidate"],
  ] as const;
  for (const [answer, sourceQuote, polarity] of cases) {
    const result = validateEvidenceExtraction(proposal(sourceQuote, polarity), {
      answer,
      claimIds: ["claim_ownership"],
      competencyIds: ["software_engineering"],
    });
    assert.equal(result.evidence[0].sourceQuote, sourceQuote);
  }
  assert.deepEqual(validateEvidenceExtraction({ evidence: [] }, {
    answer: "这个回答与当前问题无关。",
    claimIds: ["claim_ownership"],
    competencyIds: ["software_engineering"],
  }), { evidence: [] });
});

test("rejects untraceable or out-of-context evidence", () => {
  const context = {
    answer: "我独立实现了召回模块。",
    claimIds: ["claim_ownership"],
    competencyIds: ["software_engineering"],
  };
  const invalid = [
    proposal("团队实现了生成模块。", "support"),
    { ...proposal(context.answer, "support"), evidence: [{
      ...proposal(context.answer, "support").evidence[0], claimIds: ["invented_claim"],
    }] },
    { ...proposal(context.answer, "support"), evidence: [{
      ...proposal(context.answer, "support").evidence[0], competencyId: "invented_competency",
    }] },
    { ...proposal(context.answer, "support"), evidence: [{
      ...proposal(context.answer, "support").evidence[0], strength: 1.1,
    }] },
  ];
  for (const value of invalid) {
    assert.throws(() => validateEvidenceExtraction(value, context));
  }
});
