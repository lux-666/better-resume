import { readFileSync } from "node:fs";
import type { InterviewState } from "../../interview-core/src/types.ts";
const names = ["ownership-grill", "metric-audit", "failure-forensics", "consistency-check"] as const;
const playbooks = Object.fromEntries(names.map((name) => [name, readFileSync(new URL(`../../../skills/${name}/playbook.md`, import.meta.url), "utf8")]));
export function playbookFor(state: InterviewState): string {
  const field = state.traces.at(-1)?.targetFieldId ?? "";
  const name = state.report.contradictions.some((item) => item.status === "open") ? "consistency-check"
    : field.endsWith(":measurement") ? "metric-audit" : field.endsWith(":failure") ? "failure-forensics" : "ownership-grill";
  return playbooks[name];
}
