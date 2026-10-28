import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');
if (process.env.DOTENV_CONFIG_PATH) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH, override: true });
}
dotenv.config({ path: resolve(rootDir, '.env'), override: true });
import { serve } from '@hono/node-server';
import app from './routes/index.js';
import { bootstrapRagIndex } from './rag/pipeline.js';

const port = Number(process.env.PORT ?? 3001);

console.log(`🚀 Corroba API running on http://localhost:${port}`);
console.log(`   Demo mode: ${process.env.AI_DEMO_MODE !== 'false' ? 'ON' : 'OFF'}`);

bootstrapRagIndex().then((r) => {
  console.log(`   RAG index: ${r.chunksIndexed} chunks from ${r.documentsIngested} docs + demo-data (${r.source})`);
}).catch((e) => {
  console.warn('   RAG bootstrap skipped:', e instanceof Error ? e.message : e);
});

serve({ fetch: app.fetch, port });
