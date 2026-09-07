type ParsedProject = {
  name: string;
  description: string;
};

type ParsedResume = {
  name?: string;
  skills: string[];
  projects: ParsedProject[];
};

export function extractPdfPageText(items: unknown[]): string {
  const positioned = items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return [];
    const str = item.str;
    const transform = item.transform;
    if (typeof str !== "string" || !Array.isArray(transform) || typeof transform[4] !== "number" || typeof transform[5] !== "number") return [];
    return [{ str, x: transform[4], y: transform[5] }];
  }).filter((item) => item.str);
  positioned.sort((left, right) => right.y - left.y || left.x - right.x);
  const lines: Array<{ y: number; parts: string[] }> = [];
  for (const item of positioned) {
    const line = lines.at(-1);
    if (!line || Math.abs(line.y - item.y) > 2) lines.push({ y: item.y, parts: [item.str] });
    else line.parts.push(item.str);
  }
  return lines.map((line) => line.parts.join("")).join("\n");
}

function listItems(value: string): string[] {
  return [...new Set(value.split(/[,，、;；\n|]/).map((item) => item.replace(/^[-*•]\s*/, "").trim()).filter(Boolean))];
}

function inlineValue(lines: string[], labels: RegExp): string | undefined {
  for (const line of lines) {
    const match = line.match(labels);
    if (match?.[1]?.trim()) return match[1].trim();
  }
}

function sectionValue(lines: string[], headings: RegExp): string | undefined {
  const allHeadings = /^(?:姓名|技能|专业技能|技术栈|专业能力|项目经历|项目经验|项目名称|项目角色|项目描述|项目成果|岗位|岗位名称|职位名称|岗位介绍|职位介绍|岗位职责|工作职责|职责|岗位要求|任职要求|要求|name|skills?|projects?|project name|project role|description|outcomes?|position|title|overview|responsibilities|requirements|qualifications)\s*[:：]?/i;
  const start = lines.findIndex((line) => headings.test(line.trim()));
  if (start < 0) return undefined;
  const inline = lines[start].replace(headings, "").replace(/^\s*[:：-]\s*/, "").trim();
  const values = inline ? [inline] : [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (allHeadings.test(lines[index].trim())) break;
    if (lines[index].trim()) values.push(lines[index].trim());
  }
  return values.join("\n") || undefined;
}

function projectDescription(block: string[]): string {
  const parts = [
    ["项目角色", inlineValue(block, /^(?:项目角色|职责|project role|role)\s*[:：-]\s*(.+)$/i)],
    ["项目经历", sectionValue(block, /^(?:项目描述|描述|description)\s*[:：]?/i)],
    ["技术", sectionValue(block, /^(?:技术|技术栈|technologies|tech stack)\s*[:：]?/i)],
    ["成果", sectionValue(block, /^(?:成果|项目成果|结果|outcomes?|results?)\s*[:：]?/i)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (parts.length > 0) return parts.map(([label, value]) => `${label}：${value}`).join("\n");
  return block.slice(1).join("\n");
}

export function parseResume(text: string): ParsedResume {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const explicitName = inlineValue(lines, /^(?:姓名|name)\s*[:：-]\s*(.+)$/i);
  const firstLine = lines.find((line) => line.length <= 40
    && !/@|\d{6,}|简历|resume|技能|项目|求职|岗位/i.test(line));
  const skillText = sectionValue(lines, /^(?:技能|专业技能|技术栈|专业能力|skills?)\s*[:：]?/i) ?? "";
  const projectStarts = lines.flatMap((line, index) => {
    const match = line.match(/^(?:项目名称|项目|project name|project)\s*[:：-]\s*(.+)$/i);
    return match ? [{ index, name: match[1].trim() }] : [];
  });
  const projects = projectStarts.map((start, projectIndex): ParsedProject => {
    const end = projectStarts[projectIndex + 1]?.index ?? lines.length;
    const block = lines.slice(start.index, end);
    return {
      name: start.name,
      description: projectDescription(block),
    };
  }).filter((project) => project.description);
  if (projects.length === 0) {
    const projectText = sectionValue(lines, /^(?:项目经历|项目经验|projects?)\s*[:：]?/i);
    const projectLines = projectText?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
    const headers = projectLines.flatMap((line, index) => !/^[•*-]\s*/.test(line) && (/[｜|]/.test(line) || /20\d{2}[./年-]\d{1,2}/.test(line)) ? [index] : []);
    const detectedProjects = headers.map((start, index): ParsedProject => {
      const block = projectLines.slice(start, headers[index + 1] ?? projectLines.length);
      const name = (block[0].split(/[｜|]/).pop() ?? block[0]).replace(/\s+20\d{2}[./年-].*$/, "").trim();
      return { name, description: block.slice(1).join("\n") };
    }).filter((project) => project.description);
    projects.push(...detectedProjects);
    if (projects.length === 0) projects.push({ name: "主要项目经历", description: projectText?.slice(0, 8_000) ?? "" });
  }
  return { name: explicitName?.trim() ?? firstLine?.replace(/\s+/g, ""), skills: listItems(skillText), projects };
}
