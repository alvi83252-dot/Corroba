const DEFAULT_DATABASE = 'proofloop';

export function getDatabaseName(connectionString?: string): string {
  const url = connectionString ?? buildConnectionString();
  try {
    const parsed = new URL(url.replace(/^postgresql:\/\//, 'http://'));
    const name = parsed.pathname.replace(/^\//, '').split('?')[0];
    return name || DEFAULT_DATABASE;
  } catch {
    return DEFAULT_DATABASE;
  }
}

export function replaceDatabaseName(connectionString: string, databaseName: string): string {
  if (/(postgresql:\/\/[^/]+\/)[^/?]+/.test(connectionString)) {
    return connectionString.replace(/(postgresql:\/\/[^/]+\/)[^/?]+/, `$1${databaseName}`);
  }
  return `${connectionString.replace(/\/$/, '')}/${databaseName}`;
}

/** Build app DATABASE_URL from env (DATABASE_URL, or DB_URL + credentials) */
export function buildConnectionString(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const jdbcUrl = process.env.DB_URL?.trim();
  const username = process.env.DB_USERNAME?.trim() ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? '';

  if (jdbcUrl?.startsWith('jdbc:postgresql://')) {
    const hostPath = jdbcUrl.replace('jdbc:postgresql://', '');
    const encodedPassword = encodeURIComponent(password);
    return `postgresql://${username}:${encodedPassword}@${hostPath}`;
  }

  return `postgresql://proofloop:proofloop@localhost:5432/${DEFAULT_DATABASE}`;
}

/** Connect to postgres maintenance DB to create the app database */
export function buildAdminConnectionString(): string {
  const base = buildConnectionString();
  return replaceDatabaseName(base, 'postgres');
}

export const DEFAULT_WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440001';
