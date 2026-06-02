import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, UploadCloud, AlertCircle } from 'lucide-react';
import QueueActionButton from '@/components/QueueActionButton';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { listLiveClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';
import { isApproved, isReadyForSubmission, isRejected, isSubmitted } from '@/lib/claimLifecycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SubmissionQueuePage() {
  let user: any = null;
  let liveClaims: any[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch (err: any) {
    console.error('Supabase auth check failed in Submission Queue Page:', err.message);
  }

  try {
    liveClaims = await listLiveClaims(user?.id);
  } catch (err: any) {
    console.error('Failed to load live claims in Submission Queue Page:', err.message);
    try {
      liveClaims = await listLiveClaims(null);
    } catch (fallbackErr: any) {
      console.error('Fallback load failed in Submission Queue Page:', fallbackErr.message);
    }
  }

  const liveReadyCount = liveClaims.filter((claim) => isReadyForSubmission(claim.status)).length;
  const liveSubmittedCount = liveClaims.filter(
    (claim) => isSubmitted(claim.status) || isApproved(claim.status) || isRejected(claim.status)
  ).length;

  const liveSubmittedToday = liveClaims.filter((claim) => {
    if (!isSubmitted(claim.status) && !isApproved(claim.status) && !isRejected(claim.status)) return false;
    return new Date(claim.submittedAt).toDateString() === new Date().toDateString();
  }).length;

  const submissionItems = liveClaims
    .filter((claim) => isReadyForSubmission(claim.status))
    .map((claim) => {
      const status = 'Ready for Submission';
      const detail = 'UB-04 + EDI ready for TPA dispatch';

      return {
        claimId: claim.claimId,
        tpa: claim.tpa,
        detail,
        status,
      };
    });

  return (
    <SectionShell
      currentPath="/submission-queue"
      title="Submission Queue"
      subtitle="Dispatch validated cashless packets and track TPA adjudication outcomes in real-time."
      action={
        <QueueActionButton
          endpoint="/api/claims/submit-ready"
          label="Submit Ready Claims"
          runningLabel="Submitting..."
          doneLabel="Submitted"
          icon="send"
          disabled={liveReadyCount === 0}
          disabledLabel="No Ready Claims"
        />
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Ready Now"
          value={String(liveReadyCount)}
          helper="Cleared by AI or repaired by the team and waiting for insurer submission"
          tone={liveReadyCount > 0 ? 'success' : 'muted'}
        />
        <MetricCard
          label="Queued / Sent"
          value={String(liveSubmittedCount)}
          helper="Waiting or processed batch"
          tone="info"
        />
        <MetricCard
          label="Window Closes"
          value="5 PM Daily"
          helper="Apollo Munich & Star TPA batch"
          tone="warning"
        />
        <MetricCard
          label="Submitted Today"
          value={String(liveSubmittedToday)}
          helper="Across all active TPAs"
        />
      </div>

      <div className="card p-5">
        <div className="space-y-4">
          {submissionItems.map((item) => (
            <div
              key={item.claimId}
              className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border hover:bg-muted/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-info-bg flex items-center justify-center shrink-0">
                {item.status === 'Ready for Submission' ? (
                  <UploadCloud size={18} className="text-info" />
                ) : item.status === 'Submitted' ? (
                  <Clock size={18} className="text-warning" />
                ) : item.status === 'Approved' ? (
                  <CheckCircle2 size={18} className="text-success" />
                ) : (
                  <AlertCircle size={18} className="text-danger" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground font-tabular text-base">{item.claimId}</p>
                <p className="text-xs text-muted-foreground truncate font-medium">
                  {item.tpa} — {item.detail}
                </p>
              </div>
              <StatusPill
                tone={
                  item.status === 'Ready for Submission' || item.status === 'Approved'
                    ? 'success'
                    : item.status === 'Submitted'
                      ? 'info'
                      : 'danger'
                }
              >
                {item.status}
              </StatusPill>
              <Link
                href={`/claim-intake-document-upload?claimId=${encodeURIComponent(item.claimId)}`}
                className="btn-secondary py-2 px-4 text-xs font-semibold"
              >
                Open Workspace
              </Link>
            </div>
          ))}
          {submissionItems.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No claims are ready for submission yet. Approve validation in the review workspace to add claims here.
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
