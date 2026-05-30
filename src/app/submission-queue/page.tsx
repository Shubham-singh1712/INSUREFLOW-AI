import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, UploadCloud } from 'lucide-react';
import QueueActionButton from '@/components/QueueActionButton';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { getDemoModeState } from '@/lib/demoMode';
import { listLiveClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';

const submissions = [
  ['CLM-2848', 'Star Health', 'UB-04 + EDI ready', 'Ready'],
  ['CLM-2849', 'HDFC ERGO', 'Master PDF generated', 'Ready'],
  ['CLM-2843', 'Max Bupa', 'Awaiting 5 PM batch', 'Queued'],
];

export default async function SubmissionQueuePage() {
  const [demoMode, supabase] = await Promise.all([getDemoModeState(), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const liveClaims = await listLiveClaims(user?.id);
  const liveReadyCount = liveClaims.filter((claim) => claim.status === 'ready').length;
  const liveSubmittedCount = liveClaims.filter((claim) => claim.status === 'submitted' || claim.status === 'approved').length;
  const liveSubmittedToday = liveClaims.filter((claim) => {
    if (claim.status !== 'submitted' && claim.status !== 'approved') return false;
    return new Date(claim.submittedAt).toDateString() === new Date().toDateString();
  }).length;
  const liveSubmissions = liveClaims
    .filter((claim) => claim.status === 'ready' || claim.status === 'submitted' || claim.status === 'approved')
    .map((claim) => {
      const status =
        claim.status === 'ready'
          ? 'Ready'
          : claim.status === 'approved'
            ? 'Approved'
            : 'Submitted';
      const detail =
        claim.status === 'ready'
          ? 'UB-04 + EDI ready'
          : claim.status === 'approved'
            ? 'Claim APPROVED by TPA'
            : 'UB-04 + EDI submitted';

      return [claim.claimId, claim.tpa, detail, status];
    });
  const visibleSubmissions = demoMode.enabled ? [...liveSubmissions, ...submissions] : liveSubmissions;

  return (
    <SectionShell
      currentPath="/submission-queue"
      title="Submission Queue"
      subtitle={
        demoMode.enabled
          ? 'Demo submission queue populated with mock TPA dispatch packets.'
          : 'Live submission queue. Demo packets are hidden because Demo Mode is off.'
      }
      action={
        <QueueActionButton
          endpoint="/api/claims/submit-ready"
          label="Submit Ready Claims"
          runningLabel="Submitting..."
          doneLabel="Submitted"
          icon="send"
          disabled={!demoMode.enabled && liveReadyCount === 0}
          disabledLabel="No Ready Claims"
        />
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Ready Now"
          value={demoMode.enabled ? '2' : String(liveReadyCount)}
          helper="Passed all checks"
          tone="success"
        />
        <MetricCard
          label="Queued"
          value={demoMode.enabled ? '7' : String(liveSubmittedCount)}
          helper="Waiting for batch dispatch"
          tone="info"
        />
        <MetricCard
          label="Window Closes"
          value={demoMode.enabled ? '2h 14m' : liveClaims.length > 0 ? '5 PM' : '-'}
          helper="Apollo Munich TPA batch"
          tone="warning"
        />
        <MetricCard
          label="Submitted Today"
          value={demoMode.enabled ? '16' : String(liveSubmittedToday)}
          helper="Across all TPAs"
        />
      </div>

      <div className="card p-5">
        <div className="space-y-4">
          {visibleSubmissions.map(([claim, tpa, detail, status]) => (
            <div
              key={claim}
              className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border"
            >
              <div className="w-10 h-10 rounded-xl bg-info-bg flex items-center justify-center">
                {status === 'Ready' ? (
                  <UploadCloud size={18} className="text-info" />
                ) : status === 'Submitted' ? (
                  <CheckCircle2 size={18} className="text-success" />
                ) : (
                  <Clock size={18} className="text-warning" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground font-tabular">{claim}</p>
                <p className="text-sm text-muted-foreground">
                  {tpa} - {detail}
                </p>
              </div>
              <StatusPill
                tone={status === 'Ready' || status === 'Approved' ? 'success' : status === 'Submitted' ? 'info' : 'warning'}
              >
                {status}
              </StatusPill>
              <Link
                href={`/all-claims?claim=${encodeURIComponent(claim)}`}
                className="btn-secondary"
              >
                Preview
              </Link>
            </div>
          ))}
          {visibleSubmissions.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No live submission packets are loaded yet. Submit a claim to add it to this queue.
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
