/**
 * Critical-path computation. Pure JS — no DB access, safe for client + server.
 */

export type DependencyEdge = { fromTaskId: string; toTaskId: string };

/**
 * Compute the longest dependency chain by total task duration. Returns the
 * set of task IDs that lie on a longest path (the "critical" tasks).
 */
export function criticalTaskSet(
  tasks: Array<{ id: string; startAt: Date | null; endAt: Date | null }>,
  deps: DependencyEdge[]
): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const upstream = new Map<string, string[]>();
  for (const d of deps) {
    const list = upstream.get(d.toTaskId) ?? [];
    list.push(d.fromTaskId);
    upstream.set(d.toTaskId, list);
  }
  const memo = new Map<string, { length: number; path: string[] }>();
  function durationDays(id: string): number {
    const t = byId.get(id);
    if (!t || !t.startAt || !t.endAt) return 1;
    const d = (t.endAt.getTime() - t.startAt.getTime()) / 86_400_000;
    return Math.max(1, d);
  }
  function longest(id: string): { length: number; path: string[] } {
    const cached = memo.get(id);
    if (cached) return cached;
    const dur = durationDays(id);
    let best = { length: dur, path: [id] };
    for (const dep of upstream.get(id) ?? []) {
      const sub = longest(dep);
      if (sub.length + dur > best.length) {
        best = { length: sub.length + dur, path: [...sub.path, id] };
      }
    }
    memo.set(id, best);
    return best;
  }
  let cp = { length: 0, path: [] as string[] };
  for (const t of tasks) {
    const r = longest(t.id);
    if (r.length > cp.length) cp = r;
  }
  return new Set(cp.path);
}
