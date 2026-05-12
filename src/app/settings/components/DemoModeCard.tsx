'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Database, Loader2, RadioTower, ToggleLeft, ToggleRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

type DemoModePayload = {
  enabled: boolean;
  hasLiveProvider: boolean;
  providerLabel: string;
  isManualOverride: boolean;
};

export default function DemoModeCard() {
  const router = useRouter();
  const [state, setState] = useState<DemoModePayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings/demo-mode', { cache: 'no-store' })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to load demo mode.');
        setState(payload.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load demo mode.'));
  }, []);

  const setDemoMode = async (enabled: boolean) => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/settings/demo-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to save demo mode.');

      setState(payload.data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save demo mode.');
    } finally {
      setSaving(false);
    }
  };

  const enabled = Boolean(state?.enabled);

  return (
    <div className={`card p-5 ${enabled ? 'border-success/30 bg-success-bg/10' : 'border-info/20'}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          {enabled ? (
            <ToggleRight size={22} className="text-success mb-3" />
          ) : (
            <ToggleLeft size={22} className="text-muted-foreground mb-3" />
          )}
          <h2 className="section-header mb-2">Demo Mode</h2>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${enabled ? 'bg-success-bg text-success-foreground' : 'bg-info-bg text-info'}`}>
          {enabled ? 'Demo On' : 'Live On'}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        {enabled
          ? 'Mock dashboard, claim register, and extraction fixtures are visible.'
          : `${state?.providerLabel || 'Live AI'} is active. Mock fixtures stay hidden unless you turn demo mode on.`}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setDemoMode(false)}
          disabled={!state || saving || !enabled}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
            !enabled ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          } disabled:cursor-not-allowed disabled:opacity-70`}
        >
          <RadioTower size={15} />
          Live Data
          {!enabled && <CheckCircle2 size={14} className="text-success" />}
        </button>
        <button
          type="button"
          onClick={() => setDemoMode(true)}
          disabled={!state || saving || enabled}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
            enabled ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          } disabled:cursor-not-allowed disabled:opacity-70`}
        >
          <Database size={15} />
          Mock Demo
          {enabled && <CheckCircle2 size={14} className="text-success" />}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className={state?.hasLiveProvider ? 'text-success-foreground' : 'text-warning-foreground'}>
          Provider: {state?.providerLabel || 'Checking...'}
        </span>
        {saving && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
      </div>

      {error && <p className="text-xs text-danger-foreground mt-3">{error}</p>}
    </div>
  );
}
