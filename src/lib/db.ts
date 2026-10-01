import { Pool, QueryResult, QueryResultRow } from "pg";

const APP_SCHEMA = process.env.APP_SCHEMA || "AH";
const SF_SCHEMA = process.env.SF_SCHEMA || "sf_origin";
const IS_PROD = process.env.NODE_ENV === "production";

declare global {
  // eslint-disable-next-line no-var
  var __appPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __whPool: Pool | undefined;
}

function makePool(url: string | undefined, schema: string): Pool {
  const pool = new Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // queries can't run longer than 15s — kills runaway statements
    options: `-c search_path="${schema}",public -c statement_timeout=15000`,
    // prod: TLS to Postgres. PGSSLMODE=require|verify-full can also go in the URL.
    ...(IS_PROD && { ssl: { rejectUnauthorized: process.env.PGSSLMODE !== "require" } }),
  });
  pool.on("error", (e) => console.error("[pg] idle client error:", e.message));
  return pool;
}

export function appPool(): Pool {
  if (!global.__appPool) global.__appPool = makePool(process.env.DATABASE_URL, APP_SCHEMA);
  return global.__appPool;
}

export function whPool(): Pool {
  if (!global.__whPool) {
    const url = process.env.WAREHOUSE_URL || process.env.DATABASE_URL;
    if (url === process.env.DATABASE_URL) {
      global.__whPool = global.__appPool ?? makePool(url, `public`);
      return global.__whPool!;
    }
    global.__whPool = makePool(url, "public");
  }
  return global.__whPool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  pool: Pool = appPool()
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export const S = {
  app: `"${APP_SCHEMA}"`,
  sf: `"${SF_SCHEMA}"`,
};

/** Quote every identifier; SQL reads as "SF"."contact" etc. */
export const sf = (table: string) => `"${SF_SCHEMA}"."${table}"`;
export const ah = (table: string) => `"${APP_SCHEMA}"."${table}"`;
