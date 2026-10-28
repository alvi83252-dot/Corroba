import dotenv from 'dotenv';
import { resolve } from 'path';
import { defineConfig } from 'drizzle-kit';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/proofloop'
  }
});