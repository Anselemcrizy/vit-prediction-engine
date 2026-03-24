import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let dbInstance: any = null;

if (process.env.DATABASE_URL) {
  poolInstance = new Pool({ connectionString: process.env.DATABASE_URL });
  dbInstance = drizzle(poolInstance, { schema });
} else {
  // Development mode fallback: disable DB operations, keep interfaces.
  dbInstance = {
    select: () => ({ from: () => ({ orderBy: () => [] }) }),
    insert: () => ({ values: () => ({ returning: async () => [] }) }),
    where: () => ({}),
  };
}

export const pool = poolInstance;
export const db = dbInstance;

export * from "./schema";
