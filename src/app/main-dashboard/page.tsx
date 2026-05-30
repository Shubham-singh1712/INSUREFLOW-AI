import React from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardMetricsGrid from './components/DashboardMetricsGrid';
import DashboardChartsRow from './components/DashboardChartsRow';
import RecentClaimsTable from './components/RecentClaimsTable';
import ActivityTimeline from './components/ActivityTimeline';
import SubmissionQueueWidget from './components/SubmissionQueueWidget';
import { demoDashboardClaims, demoDashboardMetrics, emptyDashboardMetrics } from '@/lib/demoData';
import { getDemoModeState } from '@/lib/demoMode';
import { buildLiveDashboardMetrics, listLiveClaims, toDashboardClaims, toLiveClaimsFromDemo } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';
import { getTimeOfDayGreeting, getUserDisplayName } from '@/lib/serverGreeting';

export default async function MainDashboardPage() {
  const [demoMode, supabase] = await Promise.all([getDemoModeState(), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const liveClaims = await listLiveClaims(user?.id);
  const claims = demoMode.enabled
    ? [...toDashboardClaims(liveClaims), ...demoDashboardClaims]
    : toDashboardClaims(liveClaims);
  const metrics = demoMode.enabled
    ? buildLiveDashboardMetrics([...liveClaims, ...toLiveClaimsFromDemo(demoDashboardClaims, user?.id || 'demo-user')])
    : liveClaims.length > 0
      ? buildLiveDashboardMetrics(liveClaims)
      : emptyDashboardMetrics;
  const attentionCount = claims.filter(
    (claim) => claim.repairStatus === 'ocr_failed' || claim.repairStatus === 'signature_missing'
  ).length;
  const heading = `${getTimeOfDayGreeting()}, ${getUserDisplayName(user)}`;

  return (
    <AppLayout currentPath="/main-dashboard">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{heading}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="text-warning-foreground font-medium">{attentionCount}</span> claims
              need your attention.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select className="input-field py-2 text-sm w-40">
              <option>Today</option>
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>This month</option>
            </select>
            <a href="/claim-intake-document-upload" className="btn-primary">
              + New Claim
            </a>
          </div>
        </div>

        <DashboardMetricsGrid metrics={metrics} />

        {demoMode.enabled ? (
          <DashboardChartsRow />
        ) : (
          <div className="card p-6 text-sm text-muted-foreground">
            {liveClaims.length > 0
              ? `${liveClaims.length} live claim${liveClaims.length === 1 ? '' : 's'} processed today. Detailed trend charts will build as more claims are submitted.`
              : 'Live analytics will appear here after real claims and OCR extraction records are connected.'}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 2xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3 2xl:col-span-3">
            <RecentClaimsTable claims={claims} />
          </div>
          {demoMode.enabled ? (
            <div className="xl:col-span-1 2xl:col-span-1 space-y-6">
              <SubmissionQueueWidget />
              <ActivityTimeline />
            </div>
          ) : (
            <div className="xl:col-span-1 2xl:col-span-1 card p-5 text-sm text-muted-foreground">
              {liveClaims.length > 0
                ? `${liveClaims.length} submitted claim${liveClaims.length === 1 ? '' : 's'} waiting in the live TPA queue.`
                : 'Submission queue and activity timeline are hidden while Demo Mode is off.'}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
