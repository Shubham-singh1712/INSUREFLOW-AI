import React from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardMetricsGrid from './components/DashboardMetricsGrid';
import RecentClaimsTable from './components/RecentClaimsTable';
import { emptyDashboardMetrics } from '@/lib/demoData';
import { buildLiveDashboardMetrics, listLiveClaims, toDashboardClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';
import { getTimeOfDayGreeting, getUserDisplayName } from '@/lib/serverGreeting';

export default async function MainDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const liveClaims = await listLiveClaims(user?.id);
  const claims = toDashboardClaims(liveClaims);
  const metrics =
    liveClaims.length > 0
      ? buildLiveDashboardMetrics(liveClaims)
      : emptyDashboardMetrics;

  const attentionCount = liveClaims.filter((claim) => claim.status === 'repairs_pending').length;
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

        <div className="grid grid-cols-1 gap-6">
          <RecentClaimsTable claims={claims} />
        </div>
      </div>
    </AppLayout>
  );
}
