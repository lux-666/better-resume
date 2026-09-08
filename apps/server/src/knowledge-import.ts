import { closeSync, openSync, rmSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readKnowledgeCards } from "./knowledge-store.ts";

const categories = ["ai-agent", "algorithm", "backend", "frontend"] as const;
export function parseQuestions(raw: string) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const starts: Array<{ number: number; title: string; startLine: number }> = [];
  let fence = "";
  for (const [i, line] of lines.entries()) {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = "";
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^### Q(\d+)[:：]\s*(.+)$/);
    if (heading) starts.push({ number: Number(heading[1]), title: heading[2], startLine: i + 1 });
  }
  if (new Set(starts.map((q) => q.number)).size !== starts.length) throw new Error("Duplicate question number within source file");
  return starts.map((question, i) => {
    const endLine = (starts[i + 1]?.startLine ?? lines.length + 1) - 1;
    const text = lines.slice(question.startLine - 1, endLine).join("\n");
    const sections = new Map<string, string>();
    let label: string | undefined, values: string[] = [], inFence = false;
    const flush = () => { if (label && !sections.has(label)) sections.set(label, values.join("\n").trim().replace(/\n---\s*$/, "").trim()); };
    for (const line of text.split("\n").slice(1)) {
      if (/^\s*(`{3,}|~{3,})/.test(line)) inFence = !inFence;
      const header = !inFence && line.match(/^\*\*([^*]+)\*\*\s*[:：]?\s*(.*)$/);
      if (header) { flush(); label = header[1]; values = [header[2]]; }
      else if (!inFence && /^#{1,3} /.test(line)) { flush(); label = undefined; values = []; }
      else values.push(line);
    }
    flush();
    return { ...question, endLine, text, focus: sections.get("考察点") ?? "", statement: sections.get("题目") ?? "" };
  });
}
function neutralCard(category: string, title: string, focus: string) {
  const directions = focus.split("\n").map((line) => line.replace(/^\s*(?:\d+[.、]|[-*])\s*/, "").trim()).filter(Boolean);
  return `# ${title}\n\n本项目整理（非上游原文；规则生成的追问框架）\n\n` +
    `适用场景：候选人已提及题名中的技术或问题，或岗位要求明确涉及该主题。\n` +
    `核验重点：${category === "algorithm" ? "确认输入约束、算法不变量与复杂度依据。" : "区分概念理解、实现机制和有回答原文支持的实际经验。"}\n` +
    (directions.length ? `源题核验线索（上游考察点，未经独立事实审校）：\n${directions.map((x) => `> ${x}`).join("\n")}\n` : "源题未单列考察点：以题名中的具体机制为焦点，不补写上游结论。\n") +
    `可追问方向：${category === "algorithm" ? "先让候选人走通一个输入示例，再按回答选择边界用例、正确性或复杂度中的一个继续核验。" : "从当前回答选择一个机制或设计决策，先明确输入、输出或约束，再根据回答核验替代方案或失败边界。"}\n` +
    "浅层信号：只给术语或效果结论时，继续索取一个具体解释或例子；这本身不构成负面能力证据。\n" +
    "避免预设：不默认候选人做过题中的项目，不套用示例答案、宣传数字或上游评价；每次只问一个点。\n";
}
export function importKnowledge(sourceRoot: string, projectRoot: string) {
  const root = join(projectRoot, "knowledge");
  const destination = join(root, "cards.json");
  mkdirSync(root, { recursive: true });
  const lock = join(root, ".import.lock");
  // Serialize the whole read/merge/write cycle so concurrent imports cannot lose additions.
  closeSync(openSync(lock, "wx"));
  try {
    const cards = existsSync(destination) ? readKnowledgeCards(root).map(({ id, kind, domains, fieldKinds, depthLevels, text, source }) =>
      ({ id, kind, domains, fieldKinds, depthLevels, ...source, text })) : [];
    const existing = new Map(cards.filter((c) => /^interview-bagu-(ai-agent|algorithm|backend|frontend)-q\d+/.test(c.id))
      .map((c) => [c.id.match(/^interview-bagu-(ai-agent|algorithm|backend|frontend)-q(\d+)/)!.slice(1).map((v, i) => i ? Number(v) : v).join(":"), c]));
    const seen = new Set<string>();
    const pending: typeof cards = [];
    const counts: Record<string, number> = {};
    const license = readFileSync(join(sourceRoot, "LICENSE"), "utf8");
    for (const category of categories) {
      counts[category] = 0;
      for (const entry of readdirSync(join(sourceRoot, category)).filter((name) => name.endsWith(".md")).sort()) {
        const file = category + "/" + entry;
        const raw = readFileSync(join(sourceRoot, file));
        for (const q of parseQuestions(raw.toString("utf8"))) {
          const key = category + ":" + q.number;
          if (seen.has(key)) throw new Error("Duplicate source question: " + key);
          seen.add(key); counts[category]++;
          const old = existing.get(key);
          if (old) continue;
          const id = "interview-bagu-" + category + "-q" + String(q.number).padStart(3, "0");
          const meta = { id, kind: "competency", domains: [category === "ai-agent" ? "ai_engineering" : category, entry.replace(/\.md$/, "")],
            fieldKinds: category === "algorithm" ? ["mechanism", "measurement", "failure"] : ["mechanism", "ownership", "measurement", "failure"], depthLevels: [1, 2, 3, 4, 5],
            sourceUrl: "https://github.com/xyma2003/interview-bagu/blob/main/" + file + "#L" + q.startLine,
            sourceTitle: file + " · Q" + q.number, originalQuestion: q.title + (q.statement ? "\n\n" + q.statement : ""),
            ...(q.focus ? { sourceFocus: q.focus } : {}) };
          pending.push({ ...meta, text: neutralCard(category, q.title, q.focus).trim() });
        }
      }
    }
    if (!seen.size) throw new Error("No source questions found");
    if (pending.length) {
      writeFileSync(destination + ".tmp", JSON.stringify([...cards, ...pending], null, 2) + "\n");
      renameSync(destination + ".tmp", destination);
    }
    writeFileSync(join(root, "LICENSE"), license);
    return { total: seen.size, added: pending.length, skipped: seen.size - pending.length, counts };
  } finally {
    try { rmSync(destination + ".tmp", { force: true }); }
    finally { rmSync(lock, { force: true }); }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: npm run knowledge:import -- /path/to/interview-bagu-main");
  console.log(JSON.stringify(importKnowledge(resolve(process.argv[2]), fileURLToPath(new URL("../../../", import.meta.url))), null, 2));
}
