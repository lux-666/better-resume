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
    prompt: `你撰写面向学生和招聘方的完整岗位胜任力评估报告。先调用 read_report_artifact，再调用 submit_narrative。
以已核实的事实和实际调查过程组织论证，不按预设能力/项目逐格填表。overall 用 2–4 句连贯概括本次能力表现、岗位关联和关键边界，形成可独立阅读的综合评价，不能只是“候选人说了什么”的清单；sections 自拟有信息量的中性标题，按本次材料选择必要的主题，串起个人动作、选择依据、结果验证、实际边界。只写有证据的主题，空主题直接省略。不要把每个项目或能力强行各写一段；competencies 和 projects 留空数组。
每句必须引用已有 evidenceIds，只根据原话和报告事实写作；不得增加事实或数字。标题只概括主题，不承载未经引用的能力判断。总体讲结论，正文讲支撑和边界，建议讲后续行动；不要把同一事实在总体、项目、能力等章节重复铺陈，不要重复整段原话。支持和冲突都需交代；未问到的内容集中留在调查范围，不写成能力不足。
requirements 必须为 requirementMatrix 中每条 must 要求保留一个 conclusion（只用该要求 evidenceIds），requirementId 和 status 原样复制，不得提升结论；无证据用“${noEvidenceText}”和空引用。没有 must 时 requirements 为空数组。insights 和 improvementPlan 必须提供（没有证据时用空数组）。insights 选取最有区分度的优势、待提升项或风险，每项自拟标题，用 explanation 一个完整段落串起结论—事实依据—对目标岗位的意义，引用 evidenceIds。strength 只能引用真正受支持的事实；development 要区分实际薄弱表现与尚未验证，risk 写具体陈述冲突；不要为了凑对称而编造优缺点。
improvementPlan 给出最多三个最值得做的练习任务：priority=first/next/stretch 表示先后顺序；rationale 引用本次回答解释为什么优先做；action 写明具体练习、操作步骤和应产出的作品；acceptance 写如何检查成果完成。计划中的数字只能是明确的未来练习安排，不得冒充既有成绩。不要泛泛地说“加强学习”“提升沟通”。候选人的实际机制、业务场景、指标应进入行动任务。sections 只保留不与 insights 重复的关键项目推理链；recruiterNextSteps 只写额外核验动作，candidateFeedback 留空避免和行动计划重复。
雷达图和岗位匹配分由 assessment 程序化提供，你解释影响结论的已调查范围与必须要求缺口，不另编分数、排名、录用概率或能力认证；不把 evidenceStrengthIndex 当能力总分。禁止录用、淘汰、薪资、职级等越界结论。全篇无证据时 overall 只用“${noEvidenceText}”，sections 留空。unexploredLeads 必须逐字复制 dropped 线索列表。只输出工具调用。`,
    tools: [
      { name: "read_report_artifact", label: "Read grounded artifact", description: "Read report facts and allowed evidence references", parameters: Type.Object({}),
        execute: async () => { read = true; return { content: [{ type: "text", text: JSON.stringify({ report: options.report,
          verdicts: options.report.competencies.map((item) => ({ competencyId: item.competencyId, verdict: competencyVerdict(options.report, item.competencyId) })) }) }], details: {} }; } },
      { name: "submit_narrative", label: "Submit cited narrative", description: "Submit the report narrative with grounded citations", parameters: ReportNarrativeSchema,
        execute: async (_, value) => {
          if (!read) throw new EvidenceValidationError("Read the report first");
          const narrative = validateNarrative(value, options.report);
          if (!narrative.insights || !narrative.improvementPlan) throw new EvidenceValidationError("Include insights and improvementPlan, using empty arrays only without relevant evidence");
          if (options.report.projects.some((project) => project.fields.some((field) => field.evidence.length)) && (!narrative.insights.length || !narrative.improvementPlan.length)) throw new EvidenceValidationError("Use the available evidence to provide analysis and an actionable development task");
          accepted = narrative;
          return { content: [{ type: "text", text: "Narrative accepted" }], details: {}, terminate: true };
        } },
    ] });
  agent.shouldStopAfterTurn = ({ toolResults }) => { failures += toolResults.filter((item) => item.isError).length; return failures >= 2; };
  return runObservedAgent(agent, "请基于报告事实生成引用受控的中文叙述。", () => {
    if (!accepted) { if (agent.state.errorMessage) throw new ModelProviderError("Narrative provider failed"); throw new EvidenceValidationError("Narrative validation failed"); }
    return accepted;
  }, options.signal);
}
