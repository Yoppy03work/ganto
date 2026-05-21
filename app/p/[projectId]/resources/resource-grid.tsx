"use client";

type GridDTO = {
  weeks: { start: string; label: string }[];
  rows: Record<string, number[]>;
  peak: number;
};

/**
 * Heatmap of weekly workload per assignee. Cell intensity scales with the
 * task count relative to the grid's peak.
 */
export function ResourceGridView({
  grid,
  members,
}: {
  grid: GridDTO;
  members: { userId: string; name: string }[];
}) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">メンバーがいません。</p>
    );
  }

  function cellStyle(count: number): React.CSSProperties {
    if (count === 0) return {};
    const ratio = grid.peak > 0 ? count / grid.peak : 0;
    // Map 0..1 to a soft → strong primary tint.
    const alpha = 0.15 + ratio * 0.65;
    return {
      background: `color-mix(in oklab, var(--primary) ${Math.round(
        alpha * 100
      )}%, transparent)`,
    };
  }

  return (
    <div className="overflow-auto border border-border rounded-md">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-muted/40 text-left font-medium px-3 py-2 border-b border-r border-border min-w-[140px]">
              担当者
            </th>
            {grid.weeks.map((w, i) => (
              <th
                key={i}
                className="font-mono font-normal text-[10px] text-muted-foreground px-1 py-2 border-b border-border whitespace-nowrap min-w-[44px] text-center"
                title={new Date(w.start).toLocaleDateString()}
              >
                {w.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const row = grid.rows[m.userId] ?? [];
            return (
              <tr key={m.userId}>
                <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-r border-border truncate min-w-[140px] max-w-[200px]">
                  {m.name}
                </td>
                {grid.weeks.map((_, i) => {
                  const count = row[i] ?? 0;
                  return (
                    <td
                      key={i}
                      className="text-center border-border/50 border-[0.5px] tabular-nums"
                      style={cellStyle(count)}
                      title={`${count} task(s)`}
                    >
                      {count > 0 ? count : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
