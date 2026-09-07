import { existsSync, readFileSync } from "node:fs";
import { Check } from "typebox/value";
import { CreateInterviewBodySchema, type CreateInterviewBody, type InterviewStateResponse, type InterviewReportResponse } from "../../../packages/api-contract/src/index.ts";
const demoProfileIds = ["demo-strong", "demo-boundary", "demo-contradictory"] as const;
export type DemoProfile = { id: string; label: string; profile: string; intake: CreateInterviewBody; script: Record<string, string> };
export type DemoReplay = { id: string; recordedAt: string; snapshots: InterviewStateResponse[]; report: InterviewReportResponse };
export function demoProfiles(): DemoProfile[] {
  return demoProfileIds.map((id) => {
    const profile = JSON.parse(readFileSync(new URL(`../../../data/demo-profiles/${id}.json`, import.meta.url), "utf8")) as DemoProfile;
    if (!Check(CreateInterviewBodySchema, profile.intake)) throw new Error("Demo profile intake is invalid");
    return profile;
  });
}
export function demoReplay(id: string): DemoReplay | undefined {
  if (!demoProfileIds.some((item) => item === id)) return;
  const path = new URL(`../../../data/demo-profiles/replays/${id}.json`, import.meta.url);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as DemoReplay : undefined;
}
