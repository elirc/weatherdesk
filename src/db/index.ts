import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __wdPool?: Pool };

export const pool =
  globalForDb.__wdPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
  });

if (env.NODE_ENV !== "production") globalForDb.__wdPool = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export { schema };
