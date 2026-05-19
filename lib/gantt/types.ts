/** Shared types between API and UI for the Gantt view. */

export type GanttTaskStatus = "Todo" | "In Progress" | "Done" | "Backlog" | string;

export type GanttAssignee = {
  userId: string;
  name: string;
  image: string | null;
};

export type GanttTaskDTO = {
  id: string;
  title: string;
  status: GanttTaskStatus;
  type: string | null;
  startAt: string | null; // ISO
  endAt: string | null;   // ISO
  progress: number | null;
  visibility: "all" | "members" | "private";
  position: number;
  /**
   * Optimistic concurrency token. The client passes this back in
   * `expectedLockVersion` on each PATCH; the server bumps it on success and
   * returns the new value. A 409 from the server means the held value was
   * stale and the client must refetch.
   */
  lockVersion: number;
  assignees: GanttAssignee[];
  createdBy: string | null;
};

export const TASK_STATUSES: GanttTaskStatus[] = [
  "Todo",
  "In Progress",
  "Done",
  "Backlog",
];

export const TASK_TYPES = [
  "Feature",
  "Bug",
  "Chore",
  "Docs",
  "Design",
  "Infra",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];
