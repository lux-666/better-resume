import type {
  CandidateProfile,
  Claim,
  InterviewIntake,
  InterviewRole,
  Project,
} from "./index.ts";

function clean(value: string | undefined, maximum: number): string | undefined {
  const normalized = value?.replace(/\r\n?/g, "\n").trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function uniqueStrings(values: readonly string[], maximumItems: number, maximumLength: number): string[] {
  return [...new Set(values.map((value) => clean(value, maximumLength)).filter(Boolean) as string[])].slice(0, maximumItems);
}

function stableSuffix(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function structuredJobDescription(job: InterviewIntake["job"]): string {
  if (!job) return "未提供 Job Description；按候选人项目经历进行通用证据面试。";
  return [
    `岗位介绍\n${job.introduction}`,
    `岗位职责\n${job.responsibilities}`,
    `岗位要求\n${job.requirements}`,
  ].join("\n\n").slice(0, 8_000);
}

function requirementLines(value: string | undefined): string[] {
  return uniqueStrings((value ?? "").split("\n").map((line) => line.replace(/^\s*[-*•\d.)、]+\s*/, "")), 12, 240);
}

export function buildInterviewRole(options: { job?: InterviewIntake["job"] }): InterviewRole {
  const title = clean(options.job?.title, 120) ?? "通用候选人";
  const description = structuredJobDescription(options.job);
  const hasJob = options.job !== undefined;
  return {
    id: hasJob ? `custom_job_${stableSuffix(`${title}\n${description}`)}` : "general_candidate",
    name: title,
    source: hasJob ? "job_description" : "generic",
    description,
    requirements: requirementLines(options.job?.requirements),
    competencies: [
      { id: "ownership_delivery", name: "职责边界与交付", weight: 0.3, core: true },
      { id: "role_capability", name: hasJob ? `${title}核心能力` : "项目相关能力", weight: 0.3, core: true },
      { id: "evaluation", name: "结果与验证", weight: 0.2, core: true },
      { id: "problem_solving", name: "问题解决", weight: 0.2, core: true },
    ],
  };
}

function claim(text: string, projectId: string, relatedCompetencies: string[]): Claim {
  return {
    id: `claim_${stableSuffix(`${projectId}:${text}`)}`,
    source: "candidate_input",
    text,
    sourceQuote: text,
    projectId,
    status: "unverified",
    relatedCompetencies,
    supportingEvidenceIds: [],
    weakEvidenceIds: [],
    contradictingEvidenceIds: [],
  };
}

function projectClaims(projectId: string, input: InterviewIntake["candidate"]["projects"][number]): Claim[] {
  return [claim(input.description, projectId, [
    "ownership_delivery",
    "role_capability",
    "evaluation",
    "problem_solving",
  ])];
}

export function buildCandidateFromIntake(intake: InterviewIntake, role: InterviewRole): CandidateProfile {
  const projects: Project[] = intake.candidate.projects.map((input, index) => {
    const projectId = `project_${stableSuffix(`${index}:${input.name}`)}`;
    return {
      id: projectId,
      name: input.name,
      description: input.description,
      technologies: [],
      outcomes: [],
      claims: projectClaims(projectId, input),
      mappedCompetencies: role.competencies.filter((competency) => competency.core).map((competency) => competency.id),
      roleRelevance: 1,
    };
  });
  return {
    id: globalThis.crypto.randomUUID(),
    name: intake.candidate.name,
    education: [],
    experiences: [],
    projects,
    skills: [...intake.candidate.skills],
    claims: [],
  };
}

export function normalizeInterviewIntake(input: InterviewIntake): InterviewIntake {
  if (input.candidate.projects.length === 0) throw new Error("At least one candidate project is required");
  const projects = input.candidate.projects.slice(0, 12).map((project, index) => {
    const name = clean(project.name, 160);
    const description = clean(project.description, 8_000);
    if (!name) throw new Error(`Candidate project ${index + 1} requires a name`);
    if (!description) throw new Error(`Candidate project ${index + 1} requires a description`);
    return {
      name,
      description,
    };
  });
  const title = clean(input.job?.title, 120);
  const introduction = clean(input.job?.introduction, 8_000);
  const responsibilities = clean(input.job?.responsibilities, 12_000);
  const requirements = clean(input.job?.requirements, 12_000);
  if (input.job && (!title || !introduction || !responsibilities || !requirements)) {
    throw new Error("Job requires title, introduction, responsibilities, and requirements");
  }
  return {
    candidate: {
      name: clean(input.candidate.name, 100) ?? "匿名候选人",
      skills: uniqueStrings(input.candidate.skills, 50, 80),
      projects,
    },
    ...(title && introduction && responsibilities && requirements ? {
      job: {
        title,
        introduction,
        responsibilities,
        requirements,
      },
    } : {}),
  };
}
