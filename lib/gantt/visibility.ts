/**
 * Role-based task visibility. Shared by the server-rendered Gantt page, the
 * report page, and the resource-load view so aggregates never leak tasks a
 * given role/user is not allowed to see.
 *
 * Pure function (no `server-only`) so it can be imported anywhere without
 * pulling server-only code into a client bundle.
 *
 * Rules:
 * - Owner / Admin see everything.
 * - `all` visibility is visible to every member.
 * - `members` visibility is visible to every non-Viewer.
 * - `private` visibility is visible only to its creator or an assignee.
 */
export type VisibilityTask = {
  visibility: string;
  createdBy: string | null;
  assignees: { userId: string }[];
};

export function isTaskVisible(
  task: VisibilityTask,
  roleName: string,
  userId: string
): boolean {
  if (roleName === "Owner" || roleName === "Admin") return true;
  if (task.visibility === "all") return true;
  if (task.visibility === "members" && roleName !== "Viewer") return true;
  if (task.visibility === "private") {
    return (
      task.createdBy === userId ||
      task.assignees.some((a) => a.userId === userId)
    );
  }
  return false;
}

export function filterVisibleTasks<T extends VisibilityTask>(
  tasks: T[],
  roleName: string,
  userId: string
): T[] {
  return tasks.filter((t) => isTaskVisible(t, roleName, userId));
}
