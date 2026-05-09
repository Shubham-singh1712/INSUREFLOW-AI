import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';

const queue = [
  { claim: 'CLM-2847', issue: 'Physician signature not detected', severity: 'High', progress: ['OCR passed', 'Signature failed', 'Repair pending'] },
  { claim: 'CLM-2850', issue: 'Invoice total mismatch', severity: 'Medium', progress: ['OCR passed', 'Math failed', 'Repair suggested'] },
  { claim: 'CLM-2840', issue: 'Low CPT confidence', severity: 'Medium', progress: ['Extraction complete', 'Manual coding review', 'Awaiting confirmation'] },
];

export default function ValidationQueuePage() {
  return (
    <SectionShell
      currentPath="/validation-queue"
      title="Validation Queue"
      subtitle="Review AI-detected risks before claims move into final submission packaging."
      action={<button className="btn-primary gap-2"><ShieldCheck size={15} /> Run Batch Validation</button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="Waiting Review" value="5" helper="Assigned to insurance desk" tone="warning" />
        <MetricCard label="Critical Risks" value="2" helper="Likely rejection without repair" tone="danger" />
        <MetricCard label="Auto Repairs" value="11" helper="Suggested by AI this morning" tone="success" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {queue.map((item) => (
          <div key={item.claim} className="card p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="font-bold text-foreground font-tabular">{item.claim}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.issue}</p>
              </div>
              <StatusPill tone={item.severity === 'High' ? 'danger' : 'warning'}>{item.severity}</StatusPill>
            </div>
            <div className="space-y-3">
              {item.progress.map((step, index) => (
                <div key={step} className="flex items-center gap-3">
                  {index === item.progress.length - 1 ? <AlertTriangle size={15} className="text-warning" /> : <CheckCircle2 size={15} className="text-success" />}
                  <span className="text-sm text-foreground">{step}</span>
                </div>
              ))}
            </div>
            <button className="btn-secondary w-full mt-5">Open Review</button>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
