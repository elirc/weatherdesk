import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/app/dashboard/_components/client";
import { getOrgPlan } from "@/lib/api/limits";
import { isOrgAdmin, pageOrgMember } from "@/lib/api/page-guards";
import { env } from "@/lib/env";
import { formatLagosDate } from "@/lib/time";
import { countSeats, listMembers, listPendingInvitations } from "@/server/queries/org";
import { InviteForm, RoleSelect } from "../_components/client";
import { cancelInvitationAction, removeMemberAction } from "./actions";

/** /org/[orgId] — team: members, roles, invitations. */
async function OrgTeamPageContent({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, memberRole } = await pageOrgMember(orgId, `/org/${orgId}`);
  const [members, invites, plan, seats] = await Promise.all([
    listMembers(orgId),
    listPendingInvitations(orgId),
    getOrgPlan(orgId),
    countSeats(orgId),
  ]);
  const admin = isOrgAdmin(memberRole);
  const base = env.APP_URL.replace(/\/$/, "");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            {seats} of {plan.limits.teamMembers} seats used (members + pending invitations).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y" data-testid="org-members">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">
                    {m.name} {m.userId === user.id && <span className="text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {memberRole === "owner" && m.role !== "owner" ? (
                    <RoleSelect organizationId={orgId} memberId={m.id} role={m.role} />
                  ) : (
                    <span className="text-sm text-muted-foreground">{m.role}</span>
                  )}
                  {admin && m.role !== "owner" && m.userId !== user.id && (
                    <ActionButton
                      action={removeMemberAction}
                      payload={{ organizationId: orgId, memberId: m.id }}
                      label="Remove"
                      variant="ghost"
                      confirm={`Remove ${m.email}?`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite a teammate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InviteForm organizationId={orgId} />
            {invites.length > 0 && (
              <ul className="divide-y rounded-md border text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p>
                        {i.email} · {i.role ?? "member"} · expires {formatLagosDate(i.expiresAt)}
                      </p>
                      <code className="block truncate text-[11px] text-muted-foreground">
                        {base}/org/accept-invite/{i.id}
                      </code>
                    </div>
                    <ActionButton
                      action={cancelInvitationAction}
                      payload={{ organizationId: orgId, invitationId: i.id }}
                      label="Cancel"
                      variant="ghost"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Own Suspense boundary: session/params reads must stream for instant navigations (cacheComponents). */
export default function OrgTeamPage(props: Parameters<typeof OrgTeamPageContent>[0]) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <OrgTeamPageContent {...props} />
    </Suspense>
  );
}
