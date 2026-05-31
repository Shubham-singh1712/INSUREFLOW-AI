import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import QueueActionButton from '@/components/QueueActionButton';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { listLiveClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';

export default async function ValidationQueuePage() {
  let user: any = null;
  let liveClaims: any[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch (err: any) {
    console.error('Supabase auth check failed in Validation Queue Page:', err.message);
  }

  try {
    liveClaims = await listLiveClaims(user?.id);
  } catch (err: any) {
    console.error('Failed to load live claims in Validation Queue Page:', err.message);
    try {
      liveClaims = await listLiveClaims(null);
    } catch (fallbackErr: any) {
      console.error('Fallback load failed in Validation Queue Page:', fallbackErr.message);
    }
  }

  // Filter claims that need validation review (status = VALIDATION_REQUIRED)
  const validationClaims = liveClaims.filter((claim) => claim.status === 'VALIDATION_REQUIRED');

  const waitingReview = validationClaims.length;
  const criticalRisks = validationClaims.filter((claim) => claim.rejectionRisk === 'high').length;
  const cleanCount = liveClaims.filter(
    (claim) => claim.status === 'READY_TO_SUBMIT' || claim.status === 'SUBMITTED' || claim.status === 'APPROVED'
  ).length;

  const queueItems = validationClaims.map((claim) => {
    const valCount = claim.validationCount || claim.reviewReasons?.length || 0;
    return {
      claim: claim.claimId,
      issue: `${valCount} validation issue${valCount === 1 ? '' : 's'} detected`,
      severity: claim.rejectionRisk === 'high' ? 'High' : claim.rejectionRisk === 'medium' ? 'Medium' : 'Low',
      status: 'Repairs Pending',
      issues: claim.reviewReasons && claim.reviewReasons.length > 0 ? claim.reviewReasons : ['Needs manual review'],
    };
  });

  return (
    <SectionShell
      currentPath="/validation-queue"
      title="Validation Queue"
      subtitle="Resolve AI-detected compliance mismatches, missing seals, and logical errors before submission."
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
          value={String(waitingReview)}
          helper="Assigned to insurance desk"
          tone={waitingReview > 0 ? 'warning' : 'muted'}
        />
        <MetricCard
          label="Critical Risks"
          value={String(criticalRisks)}
          helper="Likely rejection without repair"
          tone={criticalRisks > 0 ? 'danger' : 'muted'}
        />
        <MetricCard
          label="Validated Clean"
          value={String(cleanCount)}
          helper="Passed AI checks today"
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {queueItems.map((item) => (
          <div key={item.claim} className="card p-5 hover:shadow-lg transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="font-bold text-foreground font-tabular text-lg">{item.claim}</p>
                  <p className="text-xs font-semibold text-rose-600 mt-1 uppercase tracking-wider">{item.issue}</p>
                </div>
                <StatusPill
                  tone={
                    item.severity === 'High'
                      ? 'danger'
                      : item.severity === 'Medium'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {item.severity} Severity
                </StatusPill>
              </div>
              <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Unresolved Errors</p>
                {item.issues.map((issue, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <AlertTriangle size={13} className="text-warning shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-700 leading-snug font-medium truncate max-w-[220px]" title={issue}>
                      {issue}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <Link
              href={`/claim-intake-document-upload?claimId=${encodeURIComponent(item.claim)}`}
              className="btn-primary w-full justify-center text-center py-2.5 font-semibold text-sm"
            >
              Open Workspace
            </Link>
          </div>
        ))}
        {queueItems.length === 0 && (
          <div className="xl:col-span-3 card p-8 text-center text-muted-foreground">
            No claims require review in the validation queue. All claim records are validated clean!
          </div>
        )}
      </div>
    </SectionShell>
  );
}
