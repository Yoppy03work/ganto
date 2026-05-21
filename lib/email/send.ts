import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * Thin email sender backed by Resend. Designed to FAIL SOFT: if RESEND_API_KEY
 * / EMAIL_FROM aren't configured (e.g. local dev or not-yet-set-up prod), it
 * logs and returns false instead of throwing — callers (notifications) treat
 * email as best-effort on top of the in-app notification.
 *
 * The `resend` package is a dependency; we import lazily so the cost is only
 * paid when we actually send.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    // Not configured — silently skip (in-app notification still delivered).
    return false;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) {
      Sentry.captureException(new Error(`Resend error: ${error.message ?? "unknown"}`));
      return false;
    }
    return true;
  } catch (e) {
    Sentry.captureException(e);
    return false;
  }
}

/** Build a notification email for an @mention or assignment. */
export function notificationEmail(opts: {
  recipientName: string;
  actorName: string;
  projectName: string;
  taskTitle: string | null;
  kind: "mention" | "assigned" | "comment";
  url: string;
}): { subject: string; html: string; text: string } {
  const verb =
    opts.kind === "mention"
      ? "メンションしました"
      : opts.kind === "assigned"
        ? "タスクにアサインしました"
        : "コメントしました";
  const target = opts.taskTitle ? `「${opts.taskTitle}」` : opts.projectName;
  const subject = `[ganto] ${opts.actorName} があなたを${verb}: ${target}`;
  const text = `${opts.actorName} が ${opts.projectName} の ${target} であなたを${verb}。\n\n${opts.url}`;
  const html = `
    <div style="font-family: system-ui, sans-serif; font-size: 14px; color: #111;">
      <p>${escapeHtml(opts.actorName)} が <strong>${escapeHtml(opts.projectName)}</strong> の ${escapeHtml(target)} であなたを${verb}。</p>
      <p><a href="${opts.url}" style="color: #2563eb;">ganto で開く →</a></p>
    </div>
  `;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
