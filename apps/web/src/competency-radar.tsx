import type { CompetencyAssessment } from "../../../packages/interview-core/src/assessment.ts";

export function CompetencyRadar({ dimensions }: { dimensions: CompetencyAssessment["dimensions"] }) {
  const axes = [...dimensions].sort((a, b) => b.weight - a.weight).slice(0, 8);
  if (axes.length < 3) return <p className="field-hint">雷达图需要至少三个能力维度；当前分项结果见能力明细。</p>;
  const point = (index: number, radius: number) => {
    const angle = index * Math.PI * 2 / axes.length - Math.PI / 2;
    return [220 + Math.cos(angle) * radius, 172 + Math.sin(angle) * radius];
  };
  const complete = axes.every((axis) => axis.score !== null);
  return <figure className="competency-radar">
    <svg viewBox="0 0 440 350" role="img" aria-label="能力雷达图">
      <title>{axes.map((axis) => `${axis.name}：${axis.score ?? "未评估"}`).join("；")}</title>
      <desc>满分一百分，表示本次回答展示的能力深度。未评估维度不绘制数据点，部分数据不形成封闭面积。</desc>
      {[20, 40, 60, 80, 100].map((level) => <g key={level}>
        <polygon points={axes.map((_, i) => point(i, level * 1.1).join(",")).join(" ")} fill="none" stroke="#dce4db" />
        <text x="225" y={172 - level * 1.1 + 12} className="radar-scale">{level}</text>
      </g>)}
      {axes.map((axis, i) => { const [x, y] = point(i, 110); const [tx, ty] = point(i, 126); return <g key={axis.competencyId}>
        <line x1="220" y1="172" x2={x} y2={y} stroke="#dce4db" />
        <text x={tx} y={ty} textAnchor={tx < 200 ? "end" : tx > 240 ? "start" : "middle"} dominantBaseline="middle" className="radar-label">
          <title>{axis.name}</title>{axis.name.length > 9 ? `${axis.name.slice(0, 8)}…` : axis.name}
          <tspan x={tx} dy="17" className="radar-value">{axis.score === null ? "未评估" : axis.score}</tspan>
        </text>
      </g>; })}
      {complete && <polygon points={axes.map((axis, i) => point(i, axis.score! * 1.1).join(",")).join(" ")} fill="#25705422" stroke="#257054" strokeWidth="2" />}
      {!complete && axes.map((axis, i) => {
        const next = axes[(i + 1) % axes.length];
        if (axis.score === null || next.score === null) return null;
        const [x1, y1] = point(i, axis.score * 1.1); const [x2, y2] = point((i + 1) % axes.length, next.score * 1.1);
        return <line key={axis.competencyId} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#257054" strokeWidth="2" />;
      })}
      {axes.map((axis, i) => axis.score === null ? null : <circle key={axis.competencyId} cx={point(i, axis.score * 1.1)[0]} cy={point(i, axis.score * 1.1)[1]} r="4" fill="#257054" stroke="white" strokeWidth="2" />)}
    </svg>
    <figcaption>● 已展示的能力深度 · 空缺表示尚不能评估{dimensions.length > 8 ? "；图中为权重最高的八项" : ""}</figcaption>
  </figure>;
}
