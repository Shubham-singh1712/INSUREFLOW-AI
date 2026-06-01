import React from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardMetricsGrid from './components/DashboardMetricsGrid';
import RecentClaimsTable from './components/RecentClaimsTable';
import ActivityTimeline from './components/ActivityTimeline';
import { emptyDashboardMetrics } from '@/lib/demoData';
import { buildLiveDashboardMetrics, listLiveClaims, toDashboardClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';
import { getTimeOfDayGreeting, getUserDisplayName } from '@/lib/serverGreeting';
import { isUnderReview } from '@/lib/claimLifecycle';

export default async function MainDashboardPage() {
  let user: any = null;
  let liveClaims: any[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch (err: any) {
    console.error('Supabase auth check failed in Main Dashboard Page:', err.message);
  }

  try {
    liveClaims = await listLiveClaims(user?.id);
  } catch (err: any) {
    console.error('Failed to load live claims in Main Dashboard Page:', err.message);
    try {
      liveClaims = await listLiveClaims(null);
    } catch (fallbackErr: any) {
      console.error('Fallback load failed in Main Dashboard Page:', fallbackErr.message);
    }
  }

  const claims = toDashboardClaims(liveClaims);
  const metrics =
    liveClaims.length > 0
      ? buildLiveDashboardMetrics(liveClaims)
      : emptyDashboardMetrics;

  const attentionCount = liveClaims.filter((claim) => isUnderReview(claim.status)).length;
  const heading = `${getTimeOfDayGreeting()}, ${getUserDisplayName(user)}`;

  return (
    <AppLayout currentPath="/main-dashboard">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{heading}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="text-warning-foreground font-medium">{attentionCount}</span> claim{attentionCount === 1 ? '' : 's'} need your attention.
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RecentClaimsTable claims={claims} />
          </div>
          <div>
            <ActivityTimeline />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
