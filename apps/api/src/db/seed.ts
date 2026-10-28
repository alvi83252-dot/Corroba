import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { buildConnectionString, DEFAULT_WORKSPACE_ID } from './connection.js';
import { settings, workspaces } from './schema.js';

export async function seedDatabase(): Promise<void> {
  const sql = postgres(buildConnectionString(), { max: 1 });
  const db = drizzle(sql);

  try {
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, DEFAULT_WORKSPACE_ID))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(workspaces).values({
        id: DEFAULT_WORKSPACE_ID,
        name: 'ProofLoop Demo',
        slug: 'proofloop-demo'
      });

      await db.insert(settings).values({
        workspaceId: DEFAULT_WORKSPACE_ID,
        demoMode: true,
        aiProvider: 'demo',
        integrations: {
          unify: true,
          zero: true,
          gtmengineer: true,
          faxxing: false,
          lightfern: false,
          scaile: false
        }
      });

      console.log('[db:seed] Seeded default workspace', DEFAULT_WORKSPACE_ID);
    } else {
      console.log('[db:seed] Workspace already seeded');
    }
  } finally {
    await sql.end();
  }
}
