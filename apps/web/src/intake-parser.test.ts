import assert from "node:assert/strict";
import test from "node:test";
import { extractPdfPageText, parseResume } from "./intake-parser.ts";

test("PDF text extraction restores visual line breaks", () => {
  assert.equal(extractPdfPageText([
    { str: "第二行", transform: [1, 0, 0, 1, 20, 90] },
    { str: "第一行", transform: [1, 0, 0, 1, 20, 100] },
    { str: " 内容", transform: [1, 0, 0, 1, 60, 100] },
  ]), "第一行 内容\n第二行");
});

test("resume parser maps several projects into the minimal editable intake", () => {
  const parsed = parseResume(`
姓名：林青
技能：Go、PostgreSQL、分布式系统

项目名称：订单服务改造
项目角色：核心开发
项目描述：重构交易链路并完成灰度上线。
技术：Go, PostgreSQL
项目成果：接口延迟降低 35%

项目名称：风控平台
项目描述：建设实时规则引擎。
  `);

  assert.equal(parsed.name, "林青");
  assert.deepEqual(parsed.skills, ["Go", "PostgreSQL", "分布式系统"]);
  assert.equal(parsed.projects.length, 2);
  assert.equal(parsed.projects[0].name, "订单服务改造");
  assert.match(parsed.projects[0].description, /项目角色：核心开发/);
  assert.match(parsed.projects[0].description, /成果：接口延迟降低 35%/);
  assert.deepEqual(parsed.projects[1], { name: "风控平台", description: "项目经历：建设实时规则引擎。" });
});

test("resume parser never copies an unclassified full document into project experience", () => {
  const parsed = parseResume("姓名：林青\n技能：Go\n电话：13800000000");
  assert.deepEqual(parsed.projects, [{ name: "主要项目经历", description: "" }]);
});

test("resume parser recovers projects from a PDF-style flattened layout", () => {
  const parsed = parseResume(`
黄   欣
求职岗位 AI 工程师
项目经历
华大研究院（AI 工程实习生）｜多智能体基因组组装工作流平台 2026.03—至今
• 工作流建模：梳理输入解析—方案确认—工具执行—结果复核任务闭环。
• Agent 协作：围绕 Planner、Executor、Reviewer 设计职责边界。
四梯科技（计算机视觉算法实习生）｜智能硬件考试自动评测系统 2025.09—2025.11
• 视觉识别：风扇启停判断准确率达 90% 以上。
专业能力
AI 工程：AI Agent、多智能体协作
  `);

  assert.equal(parsed.name, "黄欣");
  assert.deepEqual(parsed.projects.map((project) => project.name), [
    "多智能体基因组组装工作流平台",
    "智能硬件考试自动评测系统",
  ]);
  assert.match(parsed.projects[0].description, /工作流建模/);
  assert.match(parsed.projects[1].description, /视觉识别/);
  assert.deepEqual(parsed.skills, ["AI 工程：AI Agent", "多智能体协作"]);
});
