import type { Api, Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { ReportNarrativeSchema, type ReportNarrative } from "../../api-contract/src/narrative.ts";
import type { CandidateReportArtifact } from "../../interview-core/src/report-output.ts";
import { competencyVerdict, noEvidenceText, validateNarrative } from "../../interview-core/src/narrative.ts";
import { createObservedAgent, runObservedAgent } from "./agent-runner.ts";
import type { TelemetryCollector } from "./telemetry.ts";
import { EvidenceValidationError, ModelProviderError } from "./index.ts";
export async function generateNarrative(options: { model: Model<Api>; streamFn: StreamFn; report: CandidateReportArtifact;
  telemetry: TelemetryCollector; signal?: AbortSignal; attempt: number }): Promise<ReportNarrative> {
  let read = false;
  let accepted: ReportNarrative | undefined;
  let failures = 0;
  const agent = createObservedAgent({ ...options, operation: "narrative_agent",
    prompt: `你为招聘方撰写克制、清晰的中文面试报告。先调用 read_report_artifact，再调用 submit_narrative。每句判断必须引用对应项目/能力已有的 evidenceIds；只根据这些原话改写，不增加事实、数字或推断。总体 2–4 句。能力 verdict 使用提供的固定值；boundary 说明实际展示的深度及未展开内容，不能把未验证当作能力不足。招聘方建议与候选人反馈分开。禁止录用、淘汰、薪资、等级、rubric、评分、得分等超出口径词。无证据的项目或能力只能用原句“${noEvidenceText}”和空引用。unexploredLeads 必须逐字复制 dropped 线索列表。只输出工具调用。`,
    tools: [
      { name: "read_report_artifact", label: "Read grounded artifact", description: "Read report facts and allowed evidence references", parameters: Type.Object({}),
        execute: async () => { read = true; return { content: [{ type: "text", text: JSON.stringify({ report: options.report,
          verdicts: options.report.competencies.map((item) => ({ competencyId: item.competencyId, verdict: competencyVerdict(options.report, item.competencyId) })) }) }], details: {} }; } },
      { name: "submit_narrative", label: "Submit cited narrative", description: "Submit the report narrative with grounded citations", parameters: ReportNarrativeSchema,
        execute: async (_, value) => {
          if (!read) throw new EvidenceValidationError("Read the report first");
          accepted = validateNarrative(value, options.report);
          return { content: [{ type: "text", text: "Narrative accepted" }], details: {}, terminate: true };
        } },
    ] });
  agent.shouldStopAfterTurn = ({ toolResults }) => { failures += toolResults.filter((item) => item.isError).length; return failures >= 2; };
  return runObservedAgent(agent, "请基于报告事实生成引用受控的中文叙述。", () => {
    if (!accepted) { if (agent.state.errorMessage) throw new ModelProviderError("Narrative provider failed"); throw new EvidenceValidationError("Narrative validation failed"); }
    return accepted;
  }, options.signal);
}
