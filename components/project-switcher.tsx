"use client";

import Link from "next/link";
import { ChevronsUpDown, Check, ListTodo } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

type ProjectLite = { id: string; name: string };

/**
 * Quick project switcher for the project header. Lists the user's projects
 * and links to each Gantt, plus a shortcut to the cross-project "My tasks".
 */
export function ProjectSwitcher({
  projects,
  currentId,
}: {
  projects: ProjectLite[];
  currentId: string;
}) {
  const current = projects.find((p) => p.id === currentId);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-sm font-medium hover:text-foreground text-foreground/90 max-w-[220px]"
          title="プロジェクト切替"
        >
          <span className="truncate">{current?.name ?? "プロジェクト"}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="max-h-72 overflow-y-auto">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/50"
            >
              <span className="w-4 shrink-0">
                {p.id === currentId && <Check className="size-3.5" />}
              </span>
              <span className="truncate">{p.name}</span>
            </Link>
          ))}
        </div>
        <div className="border-t border-border mt-1 pt-1">
          <Link
            href="/my-tasks"
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/50 text-muted-foreground"
          >
            <ListTodo className="size-3.5" />
            My tasks（横断）
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/50 text-muted-foreground"
          >
            すべてのプロジェクト
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
