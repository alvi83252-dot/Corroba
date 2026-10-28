import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { buildConnectionString } from './connection.js';

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let lastConnectionError: string | null = null;

export async function getDb() {
  if (!dbInstance) {
    try {
      const connectionString = buildConnectionString();
      client = postgres(connectionString, { max: 1, connect_timeout: 5 });
      await client`SELECT 1`;
      dbInstance = drizzle(client, { schema });
      lastConnectionError = null;
    } catch (err) {
      lastConnectionError = err instanceof Error ? err.message : 'Database connection failed';
      return null;
    }
  }
  return dbInstance;
}

export function getDatabaseConnectionError(): string | null {
  return lastConnectionError;
}

export function isDemoMode() {
  return process.env.AI_DEMO_MODE === 'true' || !process.env.VOYAGE_API_KEY;
}

export { schema };
