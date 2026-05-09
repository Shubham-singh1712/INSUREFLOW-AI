import React from 'react';
import { Cloud, KeyRound, Lock, SlidersHorizontal, ToggleRight } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';

const settings = [
  ['AI validation threshold', 'Claims below 85% readiness require manual review', '85%', 'Enabled'],
  ['Signature detection', 'Flag missing signatures on discharge summaries and invoices', 'On', 'Enabled'],
  ['Blur detection', 'Warn users before low-quality scans enter OCR', 'On', 'Enabled'],
  ['Cloudinary storage', 'Store uploaded claim documents securely in cloud object storage', 'Ready', 'Configured'],
  ['JWT session policy', 'Role-protected API access with expiring tokens', '7 days', 'Enabled'],
];

export default function SettingsPage() {
  return (
    <SectionShell
      currentPath="/settings"
      title="Settings"
      subtitle="Configure AI thresholds, upload rules, security, integrations, and enterprise workflow defaults."
      action={<button className="btn-primary">Save Changes</button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="AI Threshold" value="85%" helper="Manual review cutoff" tone="info" />
        <MetricCard label="Max Upload" value="20MB" helper="Per document" />
        <MetricCard label="Roles" value="5" helper="Backend access groups" tone="success" />
        <MetricCard label="Integrations" value="3" helper="Cloudinary, OpenAI, Gemini" tone="warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 card divide-y divide-border">
          {settings.map(([name, helper, value, status]) => (
            <div key={name} className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                {name.includes('Cloudinary') ? <Cloud size={17} className="text-info" /> : name.includes('JWT') ? <KeyRound size={17} className="text-primary" /> : <SlidersHorizontal size={17} className="text-primary" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{helper}</p>
              </div>
              <span className="text-sm font-bold text-foreground font-tabular">{value}</span>
              <StatusPill tone="success">{status}</StatusPill>
            </div>
          ))}
        </div>
        <div className="space-y-5">
          <div className="card p-5">
            <Lock size={20} className="text-primary mb-3" />
            <h2 className="section-header mb-2">Security</h2>
            <p className="text-sm text-muted-foreground">Protected routes, password hashing, JWT auth, role checks, upload validation, and rate limiting are enabled in the backend.</p>
          </div>
          <div className="card p-5">
            <ToggleRight size={20} className="text-success mb-3" />
            <h2 className="section-header mb-2">Demo Mode</h2>
            <p className="text-sm text-muted-foreground">AI provider can run in mock mode until Gemini or OpenAI keys are added.</p>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
