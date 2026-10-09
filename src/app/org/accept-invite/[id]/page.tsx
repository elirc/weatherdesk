import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/api/page-guards";
import { formatLagosDate } from "@/lib/time";
import { getInvitation } from "@/server/queries/org";
import { AcceptInviteButton } from "../../_components/client";

/** /org/accept-invite/[id] — the link shared from the team page. */
async function AcceptInvitePageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser(`/org/accept-invite/${id}`);
  const inv = /^[A-Za-z0-9_-]{8,64}$/.test(id) ? await getInvitation(id) : null;
  const usable = inv && inv.status === "pending" && inv.expiresAt > new Date();
  const forMe = inv && inv.email.toLowerCase() === user.email.toLowerCase();
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{inv ? `Join ${inv.orgName}` : "Invitation not found"}</CardTitle>
        <CardDescription>
          {!inv
            ? "This link is invalid."
            : !usable
              ? `This invitation is ${inv.status === "pending" ? "expired" : inv.status}.`
              : !forMe
                ? `This invitation was sent to ${inv.email}. Sign in with that address to accept it.`
                : `You were invited as ${inv.role ?? "member"}. Expires ${formatLagosDate(inv.expiresAt)}.`}
        </CardDescription>
      </CardHeader>
      {usable && forMe && (
        <CardContent>
          <AcceptInviteButton invitationId={inv.id} />
        </CardContent>
      )}
    </Card>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function AcceptInvitePage(props: Parameters<typeof AcceptInvitePageContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <AcceptInvitePageContent {...props} />
    </Suspense>
  );
}
