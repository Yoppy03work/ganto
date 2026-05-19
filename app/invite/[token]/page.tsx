import Link from "next/link";
import { resolveInvitation } from "@/lib/projects/invitations";
import { getCurrentUser } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { AcceptButton } from "./accept-button";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inv = await resolveInvitation(token);
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">ganto</h1>
        </div>

        {!inv && <NotFoundCard />}
        {inv?.status === "expired" && (
          <StatusCard
            title="Invitation expired"
            body="Ask the project owner to send a fresh link."
          />
        )}
        {inv?.status === "used" && (
          <StatusCard
            title="Invitation already used"
            body="This single-use link was already redeemed. Ask for a new one."
          />
        )}

        {inv?.status === "pending" && !user && (
          <div className="rounded-md border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold">
              You&apos;ve been invited to join
              <span className="text-foreground"> {inv.projectName}</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Role: <span className="font-medium text-foreground">{inv.roleName}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Sign in or sign up to accept.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Link href={`/login?from=/invite/${token}`}>
                <Button variant="default">Sign in</Button>
              </Link>
              <Link href={`/signup?next=/invite/${token}`}>
                <Button variant="outline">Sign up</Button>
              </Link>
            </div>
          </div>
        )}

        {inv?.status === "pending" && user && (
          <div className="rounded-md border border-border bg-card p-5 space-y-3">
            <h2 className="text-base font-semibold">
              Join <span className="text-foreground">{inv.projectName}</span>?
            </h2>
            <p className="text-sm text-muted-foreground">
              Role: <span className="font-medium text-foreground">{inv.roleName}</span>
            </p>
            {inv.email && inv.email !== user.email && (
              <p className="text-xs text-destructive">
                This invite was sent to {inv.email}, but you&apos;re signed in as{" "}
                {user.email}. You can still accept it.
              </p>
            )}
            <AcceptButton token={token} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function NotFoundCard() {
  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-2">
      <h2 className="text-base font-semibold">Invitation not found</h2>
      <p className="text-sm text-muted-foreground">
        The link is invalid or has been revoked.
      </p>
    </div>
  );
}
