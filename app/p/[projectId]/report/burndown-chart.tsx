"use client";

type Point = { weekLabel: string; ideal: number; remaining: number };

/**
 * Simple SVG burndown: ideal (dashed) vs actual remaining (solid). No chart
 * library — a handful of polylines keeps the bundle lean.
 */
export function BurndownChart({ points }: { points: Point[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        日付の付いたタスクがないため、バーンダウンを表示できません。
      </p>
    );
  }

  const W = 640;
  const H = 240;
  const padL = 32;
  const padB = 24;
  const padT = 12;
  const padR = 12;
  const maxY = Math.max(1, ...points.map((p) => Math.max(p.ideal, p.remaining)));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) =>
    padL + (points.length === 1 ? 0 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxY) * innerH;

  const idealPath = points.map((p, i) => `${x(i)},${y(p.ideal)}`).join(" ");
  const actualPath = points.map((p, i) => `${x(i)},${y(p.remaining)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="text-muted-foreground">
        {/* axes */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="var(--border)" />
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          stroke="var(--border)"
        />
        {/* ideal (dashed) */}
        <polyline
          points={idealPath}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.6}
        />
        {/* actual (solid primary) */}
        <polyline
          points={actualPath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
        />
        {/* x labels (every other to avoid crowding) */}
        {points.map((p, i) =>
          i % Math.ceil(points.length / 8 || 1) === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              fontSize={9}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              className="font-mono"
            >
              {p.weekLabel}
            </text>
          ) : null
        )}
        <text x={padL - 4} y={padT + 4} fontSize={9} textAnchor="end" fill="var(--muted-foreground)">
          {maxY}
        </text>
        <text x={padL - 4} y={padT + innerH} fontSize={9} textAnchor="end" fill="var(--muted-foreground)">
          0
        </text>
      </svg>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground mt-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "var(--muted-foreground)" }} />
          理想
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2" style={{ borderColor: "var(--primary)" }} />
          実績（残タスク）
        </span>
      </div>
    </div>
  );
}
