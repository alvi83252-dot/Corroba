'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { api, type CrmEntry, type ZeroStatus } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const statusColors: Record<string, string> = {
  deployed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  published: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  active: 'bg-primary/20 text-primary border-primary/30',
  draft: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
};

const zeroStatusColors: Record<CrmEntry['zeroSync']['status'], string> = {
  not_synced: 'bg-secondary text-muted-foreground border-border',
  not_configured: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  synced: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const zeroStatusLabels: Record<CrmEntry['zeroSync']['status'], string> = {
  not_synced: 'Not synced',
  not_configured: 'Needs Zero keys',
  synced: 'Synced',
  failed: 'Failed'
};

function ZeroStatusBadge({ status }: { status: CrmEntry['zeroSync']['status'] }) {
  return (
    <Badge className={zeroStatusColors[status]}>
      {status === 'synced' && <CheckCircle2 className="mr-1 h-3 w-3" />}
      {status === 'failed' && <AlertCircle className="mr-1 h-3 w-3" />}
      {zeroStatusLabels[status]}
    </Badge>
  );
}

export default function CrmPage() {
  const [entries, setEntries] = useState<CrmEntry[]>([]);
  const [status, setStatus] = useState<ZeroStatus | null>(null);
  const [filter, setFilter] = useState('all');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getCrm().then(setEntries);
    api.getZeroStatus().then(setStatus).catch(() => undefined);
  }, []);

  async function syncEntry(id: string) {
    setSyncingId(id);
    setMessage('');
    try {
      const { entry, result } = await api.syncCrmEntry(id);
      setEntries((current) => current.map((item) => (item.id === id ? entry : item)));
      setMessage(result.synced ? 'Synced to Zero.' : result.error ?? 'Zero sync did not complete.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Zero sync failed.');
    } finally {
      setSyncingId(null);
    }
  }

  async function syncAll() {
    setSyncingAll(true);
    setMessage('');
    try {
      const res = await api.syncAllCrmToZero();
      const refreshed = await api.getCrm();
      setEntries(refreshed);
      setMessage(`Synced ${res.synced} of ${res.total} CRM entries to Zero.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sync failed.');
    } finally {
      setSyncingAll(false);
    }
  }

  const types = ['all', ...new Set(entries.map((entry) => entry.entityType))];
  const filtered = filter === 'all' ? entries : entries.filter((entry) => entry.entityType === filter);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Proof CRM</h1>
          <p className="text-muted-foreground mt-2">
            Store proof assets, trust signals, GTM assets, campaigns, and conversion outcomes.
          </p>
        </div>
        <Button onClick={syncAll} disabled={syncingAll || status?.mode !== 'live'}>
          {syncingAll ? 'Syncing…' : 'Sync all to Zero'}
        </Button>
      </div>

      <Card className="border-cyan-500/30 bg-cyan-500/5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
            {status?.mode === 'live' ? 'Zero Connected' : 'Zero Demo Mode'}
          </Badge>
          {status?.database.connected && (
            <Badge className="bg-emerald-500/20 text-emerald-400">PostgreSQL Connected</Badge>
          )}
          {status?.database.configured && !status.database.connected && (
            <Badge className="bg-amber-500/20 text-amber-300">PostgreSQL Offline</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {status?.mode === 'live'
            ? `Records sync to ${status.recordsUrl} and are logged in PostgreSQL when the database is available.`
            : 'Add ZERO_API_KEY and ZERO_API_URL in .env to enable live Zero sync.'}
        </p>
        {message && <p className="text-sm text-cyan-300">{message}</p>}
      </Card>

      <div className="flex flex-wrap gap-2">
        {types.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              filter === type ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-accent'
            }`}
          >
            {type === 'all' ? 'All' : type.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {filtered.map((entry) => (
          <Card key={entry.id} hover className="flex flex-wrap items-center gap-4 py-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{entry.title}</p>
              <p className="text-xs text-muted-foreground">
                {entry.entityType.replace('_', ' ')} / {entry.entityId}
              </p>
              {entry.zeroSync.lastSyncedAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last sync: {new Date(entry.zeroSync.lastSyncedAt).toLocaleString()}
                </p>
              )}
            </div>

            <Badge className={statusColors[entry.status] ?? 'bg-secondary text-secondary-foreground'}>{entry.status}</Badge>
            {entry.conversionOutcome && <Badge className="bg-emerald-500/20 text-emerald-400">{entry.conversionOutcome}</Badge>}
            <ZeroStatusBadge status={entry.zeroSync.status} />

            <div className="flex items-center gap-2">
              {entry.zeroSync.zeroUrl && (
                <a
                  href={entry.zeroSync.zeroUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-medium transition-all hover:bg-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </a>
              )}
              <Button size="sm" variant="outline" onClick={() => syncEntry(entry.id)} disabled={syncingId === entry.id}>
                <RefreshCw className={`h-3.5 w-3.5 ${syncingId === entry.id ? 'animate-spin' : ''}`} />
                {syncingId === entry.id ? 'Syncing' : 'Sync'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
