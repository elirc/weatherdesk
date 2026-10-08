import { and, eq, inArray } from "drizzle-orm";
import {
  accounts,
  customAreas,
  lgas,
  members,
  organizations,
  states,
  subscriptions,
  users,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import type { SeedContext, SeedStep } from "../lib/seed-types";

/**
 * Demo accounts (DEV/DEMO ONLY — documented in docs/DATA.md and README):
 *   admin@weatherdesk.ng / admin12345   role admin
 *   editor@weatherdesk.ng / editor12345 role editor
 *   user@weatherdesk.ng / user12345     role user
 *   orgowner@acme.ng / owner12345       owner of organisation "Acme Farms"
 * Plus Acme's custom area (3 southern-Kaduna LGAs) and an active org_basic
 * subscription. Users are created through Better Auth so passwords are hashed
 * exactly as the sign-in flow expects; roles are set afterwards by update.
 */
export const DEMO_USERS = [
  { email: "admin@weatherdesk.ng", password: "admin12345", name: "WeatherDesk Admin", role: "admin" },
  { email: "editor@weatherdesk.ng", password: "editor12345", name: "WeatherDesk Editor", role: "editor" },
  { email: "user@weatherdesk.ng", password: "user12345", name: "Demo User", role: "user" },
  { email: "orgowner@acme.ng", password: "owner12345", name: "Amina Bello", role: "user" },
] as const;

export const DEMO_ORG = { name: "Acme Farms", slug: "acme-farms" } as const;
export const DEMO_AREA = {
  name: "Southern Kaduna farms",
  state: "Kaduna",
  lgaNames: ["Chikun", "Kajuru", "Kachia"],
} as const;

/** Same rows Better Auth's signUpEmail writes: users + accounts(providerId 'credential'). */
async function insertCredentialUser(
  db: SeedContext["db"],
  u: { email: string; password: string; name: string },
): Promise<string> {
  const { hashPassword } = await import("better-auth/crypto");
  const id = newId();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id, email: u.email, name: u.name, emailVerified: true, createdAt: now, updatedAt: now });
    await tx.insert(accounts).values({
      id: newId(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword(u.password),
      createdAt: now,
      updatedAt: now,
    });
  });
  return id;
}

export const step: SeedStep = {
  name: "users",
  async run({ db, pool, log, warn }) {
    // Imported lazily: auth pulls in the adapter registry; keep other steps free of it.
    const { auth } = await import("@/lib/auth");

    let created = 0;
    let schemaWarned = false;
    const idByEmail = new Map<string, string>();
    for (const u of DEMO_USERS) {
      let [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email));
      if (!row) {
        try {
          const res = await auth.api.signUpEmail({
            body: { email: u.email, password: u.password, name: u.name },
          });
          row = { id: res.user.id };
          log(`signed up ${u.email}`);
        } catch (err) {
          // Better Auth refuses to run when the drizzle schema lags its plugins
          // (SCHEMA_MISMATCH). Keep the seed usable: write the same rows
          // signUpEmail would (user + 'credential' account, password hashed
          // with Better Auth's own hasher) and warn loudly.
          if ((err as { code?: string }).code !== "SCHEMA_MISMATCH") throw err;
          if (!schemaWarned) {
            warn(`Better Auth SCHEMA_MISMATCH (${(err as Error).message.split("\n").slice(0, 4).join(" ").trim()}) — creating demo users directly; fix src/db/schema/auth.ts`);
            schemaWarned = true;
          }
          row = { id: await insertCredentialUser(db, u) };
          log(`inserted ${u.email} (direct)`);
        }
        created += 1;
      }
      await db
        .update(users)
        .set({ role: u.role, emailVerified: true })
        .where(eq(users.id, row.id));
      idByEmail.set(u.email, row.id);
    }
    const ownerId = idByEmail.get("orgowner@acme.ng")!;

    // organisation + owner membership (direct insert into Better Auth's org tables)
    let [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, DEMO_ORG.slug));
    if (!org) {
      org = { id: newId() };
      await db.insert(organizations).values({ id: org.id, name: DEMO_ORG.name, slug: DEMO_ORG.slug });
    }
    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.organizationId, org.id), eq(members.userId, ownerId)));
    if (!member) {
      await db.insert(members).values({ id: newId(), organizationId: org.id, userId: ownerId, role: "owner" });
    }

    // custom area: lga_set of 3 Kaduna LGAs, geom = union of their boundaries
    const areaLgas = await db
      .select({ id: lgas.id })
      .from(lgas)
      .innerJoin(states, eq(states.id, lgas.stateId))
      .where(and(eq(states.name, DEMO_AREA.state), inArray(lgas.name, [...DEMO_AREA.lgaNames])));
    if (areaLgas.length !== DEMO_AREA.lgaNames.length) {
      throw new Error(`expected ${DEMO_AREA.lgaNames.length} Kaduna LGAs, found ${areaLgas.length}`);
    }
    const lgaIds = areaLgas.map((l) => l.id).sort((a, b) => a - b);
    const [area] = await db
      .select({ id: customAreas.id })
      .from(customAreas)
      .where(and(eq(customAreas.organizationId, org.id), eq(customAreas.name, DEMO_AREA.name)));
    if (!area) {
      // raw SQL only for the PostGIS union
      await pool.query(
        `insert into custom_areas (id, organization_id, name, mode, lga_ids, geom, created_by)
         select $1, $2, $3, 'lga_set', $4::int[],
                ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Union(geom)), 3)), $5
         from lgas where id = any($4::int[])`,
        [newId(), org.id, DEMO_AREA.name, lgaIds, ownerId],
      );
    }

    // active org_basic subscription
    const [sub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.organizationId, org.id), eq(subscriptions.status, "active")));
    if (!sub) {
      await db.insert(subscriptions).values({
        id: newId(),
        organizationId: org.id,
        planId: "org_basic",
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      });
    }

    return { users: DEMO_USERS.length, created, orgs: 1, customAreas: 1, subscriptions: 1 };
  },
};
