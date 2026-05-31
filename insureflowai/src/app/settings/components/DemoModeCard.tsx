'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Database, Loader2, RadioTower, ToggleLeft, ToggleRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

type DemoModePayload = {
  enabled: boolean;
  hasLiveProvider: boolean;
  providerLabel: string;
  provider: 'openrouter' | 'openai' | 'gemini' | 'local_ocr';
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
        if (!response.ok || !payload.ok)
          throw new Error(payload.error || 'Unable to load demo mode.');
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

      if (!response.ok || !payload.ok)
        throw new Error(payload.error || 'Unable to save demo mode.');

      setState(payload.data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save demo mode.');
    } finally {
      setSaving(false);
    }
  };

  const enabled = Boolean(state?.enabled);
  const isLocalOcr = state?.provider === 'local_ocr';

  return (
    <div
      className={`card p-5 ${enabled ? 'border-amber-500/30 bg-amber-500/5' : 'border-info/20'}`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          {enabled ? (
            <ToggleRight size={22} className="text-amber-500 mb-3" />
          ) : (
            <ToggleLeft size={22} className="text-muted-foreground mb-3" />
          )}
          <h2 className="section-header mb-2">⚡ Accelerator Demo Mode</h2>
        </div>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full ${enabled ? 'bg-amber-500/20 text-amber-600' : 'bg-info-bg text-info'}`}
        >
          {enabled ? 'Demo Active' : 'Live Mode'}
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {enabled
          ? 'High-fidelity mock claims, interactive matching simulator, and simulated extraction pipelines (Green/Yellow/Red paths) are active. TPA auto-approval is enabled for fast 90-second pitches.'
          : isLocalOcr
            ? 'Production extraction is active (using Local OCR). Mock fixtures stay hidden unless you turn demo mode on.'
            : `${state?.providerLabel || 'Live AI'} is active. Mock fixtures and simulated flows stay hidden unless you turn demo mode on.`}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
        <button
          type="button"
          onClick={() => setDemoMode(false)}
          disabled={!state || saving || !enabled}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
            !enabled
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
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
            enabled
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          } disabled:cursor-not-allowed disabled:opacity-70`}
        >
          <Database size={15} />
          Mock Demo
          {enabled && <CheckCircle2 size={14} className="text-success" />}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span
          className={state?.hasLiveProvider ? 'text-success-foreground' : 'text-warning-foreground'}
        >
          Provider: {state?.providerLabel || 'Checking...'}
          {isLocalOcr ? ' (no external LLM key)' : ''}
        </span>
        {saving && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
      </div>

      {error && <p className="text-xs text-danger-foreground mt-3">{error}</p>}
    </div>
  );
}
