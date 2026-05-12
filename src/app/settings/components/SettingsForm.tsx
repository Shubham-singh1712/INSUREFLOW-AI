'use client';

import React, { useMemo, useState } from 'react';
import { Check, Cloud, KeyRound, Loader2, Lock, SlidersHorizontal } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import DemoModeCard from './DemoModeCard';
import type { WorkflowSettings } from '@/lib/workflowSettings';

const Toggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-success' : 'bg-muted-foreground/30'}`}
    aria-pressed={checked}
    aria-label={label}
  >
    <span
      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
    />
  </button>
);

export default function SettingsForm({ initialSettings }: { initialSettings: WorkflowSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [settings, savedSettings]
  );
  const enabledCount = [
    settings.signatureDetection,
    settings.blurDetection,
    settings.cloudinaryStorage,
  ].filter(Boolean).length;

  const updateSetting = <K extends keyof WorkflowSettings>(key: K, value: WorkflowSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage('');
    setError('');
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/settings/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to save settings.');

      setSettings(payload.data);
      setSavedSettings(payload.data);
      setMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionShell
      currentPath="/settings"
      title="Settings"
      subtitle="Configure AI thresholds, upload rules, security, integrations, and enterprise workflow defaults."
      action={
        <button
          onClick={saveSettings}
          disabled={saving || !dirty}
          className="btn-primary gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Save Changes
        </button>
      }
    >
      {(message || error || dirty) && (
        <div
          className={`card px-5 py-3 text-sm ${error ? 'text-danger-foreground bg-danger-bg/30 border-danger/20' : 'text-muted-foreground'}`}
        >
          {error || message || 'You have unsaved changes.'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="AI Threshold"
          value={`${settings.aiThreshold}%`}
          helper="Manual review cutoff"
          tone="info"
        />
        <MetricCard label="Max Upload" value={`${settings.maxUploadMb}MB`} helper="Per document" />
        <MetricCard
          label="Rules On"
          value={`${enabledCount}/3`}
          helper="Active workflow controls"
          tone="success"
        />
        <MetricCard
          label="Session"
          value={`${settings.jwtSessionDays}d`}
          helper="JWT expiry policy"
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 card divide-y divide-border">
          <div className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <SlidersHorizontal size={17} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">AI validation threshold</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Claims below this readiness score require manual review
              </p>
            </div>
            <div className="w-48">
              <input
                type="range"
                min={1}
                max={100}
                value={settings.aiThreshold}
                onChange={(event) => updateSetting('aiThreshold', Number(event.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.aiThreshold}
              onChange={(event) => updateSetting('aiThreshold', Number(event.target.value))}
              className="input-field w-20 py-2 text-sm font-tabular"
            />
            <StatusPill tone="success">Enabled</StatusPill>
          </div>

          <div className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <SlidersHorizontal size={17} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Signature detection</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Flag missing signatures on discharge summaries and invoices
              </p>
            </div>
            <Toggle
              checked={settings.signatureDetection}
              onChange={(value) => updateSetting('signatureDetection', value)}
              label="Toggle signature detection"
            />
            <StatusPill tone={settings.signatureDetection ? 'success' : 'muted'}>
              {settings.signatureDetection ? 'Enabled' : 'Disabled'}
            </StatusPill>
          </div>

          <div className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <SlidersHorizontal size={17} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Blur detection</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Warn users before low-quality scans enter OCR
              </p>
            </div>
            <Toggle
              checked={settings.blurDetection}
              onChange={(value) => updateSetting('blurDetection', value)}
              label="Toggle blur detection"
            />
            <StatusPill tone={settings.blurDetection ? 'success' : 'muted'}>
              {settings.blurDetection ? 'Enabled' : 'Disabled'}
            </StatusPill>
          </div>

          <div className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Cloud size={17} className="text-info" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Cloudinary storage</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Store uploaded claim documents securely in cloud object storage
              </p>
            </div>
            <Toggle
              checked={settings.cloudinaryStorage}
              onChange={(value) => updateSetting('cloudinaryStorage', value)}
              label="Toggle Cloudinary storage"
            />
            <StatusPill tone={settings.cloudinaryStorage ? 'success' : 'muted'}>
              {settings.cloudinaryStorage ? 'Configured' : 'Disabled'}
            </StatusPill>
          </div>

          <div className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <KeyRound size={17} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">JWT session policy</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Role-protected API access with expiring tokens
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={30}
              value={settings.jwtSessionDays}
              onChange={(event) => updateSetting('jwtSessionDays', Number(event.target.value))}
              className="input-field w-24 py-2 text-sm font-tabular"
            />
            <span className="text-sm font-bold text-foreground">days</span>
            <StatusPill tone="success">Enabled</StatusPill>
          </div>

          <div className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <SlidersHorizontal size={17} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Max upload size</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Maximum accepted document size per uploaded file
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.maxUploadMb}
              onChange={(event) => updateSetting('maxUploadMb', Number(event.target.value))}
              className="input-field w-24 py-2 text-sm font-tabular"
            />
            <span className="text-sm font-bold text-foreground">MB</span>
            <StatusPill tone="success">Enabled</StatusPill>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <Lock size={20} className="text-primary mb-3" />
            <h2 className="section-header mb-2">Security</h2>
            <p className="text-sm text-muted-foreground">
              Protected routes, password hashing, JWT auth, role checks, upload validation, and rate
              limiting are enabled in the backend.
            </p>
          </div>
          <DemoModeCard />
        </div>
      </div>
    </SectionShell>
  );
}
