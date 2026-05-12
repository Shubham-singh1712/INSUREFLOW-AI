import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import QueueActionButton from '@/components/QueueActionButton';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { getDemoModeState } from '@/lib/demoMode';
import { listLiveClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';

const queue = [
  {
    claim: 'CLM-2847',
    issue: 'Physician signature not detected',
    severity: 'High',
    progress: ['OCR passed', 'Signature failed', 'Repair pending'],
  },
  {
    claim: 'CLM-2850',
    issue: 'Invoice total mismatch',
    severity: 'Medium',
    progress: ['OCR passed', 'Math failed', 'Repair suggested'],
  },
  {
    claim: 'CLM-2840',
    issue: 'Low CPT confidence',
    severity: 'Medium',
    progress: ['Extraction complete', 'Manual coding review', 'Awaiting confirmation'],
  },
];

export default async function ValidationQueuePage() {
  const [demoMode, supabase] = await Promise.all([getDemoModeState(), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const liveClaims = await listLiveClaims(user?.id);
  const liveQueue = liveClaims.map((claim) => ({
    claim: claim.claimId,
    issue:
      claim.repairStatus === 'clean'
        ? 'Validation passed and submitted to TPA queue'
        : 'Claim needs manual repair review',
    severity: claim.repairStatus === 'clean' ? 'Clean' : 'Medium',
    progress: ['OCR passed', 'Scrubbing passed', 'Submitted'],
  }));
  const visibleQueue = demoMode.enabled ? queue : liveQueue;
  const waitingReview = liveClaims.filter((claim) => claim.repairStatus !== 'clean').length;
  const cleanCount = liveClaims.filter((claim) => claim.repairStatus === 'clean').length;

  return (
    <SectionShell
      currentPath="/validation-queue"
      title="Validation Queue"
      subtitle={
        demoMode.enabled
          ? 'Demo validation queue populated with mock AI-detected risks.'
          : 'Live validation queue. Demo risks are hidden because Demo Mode is off.'
      }
      action={
        <QueueActionButton
          endpoint="/api/claims/batch-validation"
          label="Run Batch Validation"
          runningLabel="Running Validation..."
          doneLabel="Batch Complete"
          icon="shield"
        />
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Waiting Review"
          value={demoMode.enabled ? '5' : String(waitingReview)}
          helper="Assigned to insurance desk"
          tone="warning"
        />
        <MetricCard
          label="Critical Risks"
          value={demoMode.enabled ? '2' : '0'}
          helper="Likely rejection without repair"
          tone="danger"
        />
        <MetricCard
          label="Validated Clean"
          value={demoMode.enabled ? '11' : String(cleanCount)}
          helper="Passed AI checks today"
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {visibleQueue.map((item) => (
          <div key={item.claim} className="card p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="font-bold text-foreground font-tabular">{item.claim}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.issue}</p>
              </div>
              <StatusPill
                tone={
                  item.severity === 'Clean'
                    ? 'success'
                    : item.severity === 'High'
                      ? 'danger'
                      : 'warning'
                }
              >
                {item.severity}
              </StatusPill>
            </div>
            <div className="space-y-3">
              {item.progress.map((step, index) => (
                <div key={step} className="flex items-center gap-3">
                  {item.severity !== 'Clean' && index === item.progress.length - 1 ? (
                    <AlertTriangle size={15} className="text-warning" />
                  ) : (
                    <CheckCircle2 size={15} className="text-success" />
                  )}
                  <span className="text-sm text-foreground">{step}</span>
                </div>
              ))}
            </div>
            <Link
              href={`/claim-intake-document-upload?claimId=${encodeURIComponent(item.claim)}`}
              className="btn-secondary w-full mt-5 justify-center"
            >
              Open Review
            </Link>
          </div>
        ))}
        {visibleQueue.length === 0 && (
          <div className="xl:col-span-3 card p-8 text-center text-muted-foreground">
            No live validation items are loaded yet. Create and submit a claim to populate this
            queue.
          </div>
        )}
      </div>
    </SectionShell>
  );
}
