import assert from "node:assert/strict";
import test from "node:test";
import { parseJobDescription, parseResume } from "./intake-parser.ts";

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

test("job parser only returns the four requested sections", () => {
  const parsed = parseJobDescription(`
岗位：支付平台工程师
岗位介绍：负责支付平台核心系统。
职责：设计高并发交易链路。
要求：熟悉 Go 和数据库性能优化。
  `);

  assert.deepEqual(parsed, {
    title: "支付平台工程师",
    introduction: "负责支付平台核心系统。",
    responsibilities: "设计高并发交易链路。",
    requirements: "熟悉 Go 和数据库性能优化。",
  });
});

test("resume parser never copies an unclassified full document into project experience", () => {
  const parsed = parseResume("姓名：林青\n技能：Go\n电话：13800000000");
  assert.deepEqual(parsed.projects, [{ name: "主要项目经历", description: "" }]);
});
