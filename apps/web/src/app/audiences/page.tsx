'use client';

import { useEffect, useState } from 'react';
import { api, type RagQueryResult, type RagStatus } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface Audience {
  id: string;
  name: string;
  description: string;
  icpMatch: number;
  industry: string;
  companySize: string;
  resonanceScore: number;
}

const proofQuote = 'Our recruiters now save 12 hours per week on manual screening.';

export default function AudiencesPage() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [expanding, setExpanding] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [poweredBy, setPoweredBy] = useState('demo');
  const [ragContext, setRagContext] = useState<RagQueryResult | null>(null);
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<RagQueryResult | null>(null);
  const [querying, setQuerying] = useState(false);

  useEffect(() => {
    api.getAudiences().then((d) => setAudiences(d as Audience[]));
    api.getRagStatus().then(setRagStatus).catch(() => {});
  }, []);

  async function ingest() {
    setIngesting(true);
    try {
      const result = await api.ingestRag(true);
      setRagStatus(await api.getRagStatus());
      alert(`Indexed ${result.chunksIndexed} chunks from ${result.documentsIngested} conversations (${result.source})`);
    } finally {
      setIngesting(false);
    }
  }

  async function expand() {
    setExpanding(true);
    try {
      const res = await api.expandAudience(proofQuote);
      setAudiences(res.audiences as Audience[]);
      setPoweredBy(res.poweredBy);
      if (res.ragContext) setRagContext(res.ragContext);
    } finally {
      setExpanding(false);
    }
  }

  async function runQuery() {
    if (!query.trim()) return;
    setQuerying(true);
    try {
      setQueryResult(await api.queryRag(query));
    } finally {
      setQuerying(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Audience Expansion</h1>
          <p className="text-muted-foreground mt-2">Discover lookalike audiences from your customer conversations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={ingest} disabled={ingesting}>
            {ingesting ? 'Ingesting...' : 'Ingest Conversations'}
          </Button>
          <Button onClick={expand} disabled={expanding}>{expanding ? 'Expanding...' : 'Expand Audiences'}</Button>
        </div>
      </div>

      <Card className="border-primary/30 bg-primary/5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-primary/20 text-primary">Unify Pipeline</Badge>
          {ragStatus && (
            <>
              <Badge className="bg-secondary text-muted-foreground">{ragStatus.chunks} chunks indexed</Badge>
              <Badge className="bg-secondary text-muted-foreground">{ragStatus.embeddingProvider} embeddings</Badge>
              <Badge className={ragStatus.unifyConfigured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}>
                {ragStatus.unifyConfigured ? 'UnifyGTM connected' : 'Demo conversations'}
              </Badge>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {ragStatus?.unifyConfigured
            ? 'Connected to Unify — using live conversation data.'
            : 'Using demo conversation data — connect Unify in Settings for live data.'}
        </p>
        <p className="text-xs text-primary font-medium mb-1">Source Proof Signal</p>
        <p className="text-sm italic">&ldquo;{proofQuote}&rdquo;</p>
        <Badge className="bg-secondary text-muted-foreground">Powered by: {poweredBy === 'unify' ? 'Unify' : poweredBy === 'rag' ? 'Smart search' : 'Demo mode'}</Badge>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">RAG Query</h2>
        <p className="text-sm text-muted-foreground">Ask questions against indexed Unify conversation data.</p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Which industries mention 12 hours per week time savings?"
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            onKeyDown={(e) => e.key === 'Enter' && runQuery()}
          />
          <Button onClick={runQuery} disabled={querying}>{querying ? 'Searching...' : 'Query RAG'}</Button>
        </div>
        {queryResult && (
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <p className="text-sm">{queryResult.answer}</p>
            <div className="space-y-2">
              {queryResult.chunks.map((chunk) => (
                <div key={chunk.id} className="rounded border border-border/50 p-3 text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-primary">{chunk.title}</span>
                    <span className="text-muted-foreground">score {chunk.score}</span>
                  </div>
                  <p className="text-muted-foreground line-clamp-3">{chunk.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {ragContext && (
        <Card className="space-y-3 border-violet-500/30">
          <h2 className="font-semibold text-sm">RAG Context Used for Expansion</h2>
          <p className="text-sm text-muted-foreground">{ragContext.answer}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {ragContext.chunks.slice(0, 4).map((chunk) => (
              <div key={chunk.id} className="rounded-lg bg-muted/30 p-3 text-xs">
                <p className="font-medium text-primary mb-1">{chunk.title}</p>
                <p className="text-muted-foreground line-clamp-2">{chunk.text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {audiences.map((audience) => (
          <Card key={audience.id ?? audience.name} hover className="space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">{audience.name}</h3>
              <span className="text-lg font-bold text-primary">{audience.resonanceScore}%</span>
            </div>
            <p className="text-sm text-muted-foreground">{audience.description}</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-secondary text-secondary-foreground">{audience.industry}</Badge>
              <Badge className="bg-accent text-accent-foreground">{audience.companySize}</Badge>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">ICP Match</span>
                <span>{audience.icpMatch}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400 transition-all duration-700" style={{ width: `${audience.icpMatch}%` }} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
