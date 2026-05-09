import React from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardMetricsGrid from './components/DashboardMetricsGrid';
import DashboardChartsRow from './components/DashboardChartsRow';
import RecentClaimsTable from './components/RecentClaimsTable';
import ActivityTimeline from './components/ActivityTimeline';
import SubmissionQueueWidget from './components/SubmissionQueueWidget';

export default function MainDashboardPage() {
  return (
    <AppLayout currentPath="/main-dashboard">
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Operations Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Good morning, Sneha — <span className="text-warning-foreground font-medium">5 claims need your attention</span> before the 5:00 PM submission window.
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

        {/* KPI Metrics Grid */}
        <DashboardMetricsGrid />

        {/* Charts row */}
        <DashboardChartsRow />

        {/* Bottom section: table + sidebar widgets */}
        <div className="grid grid-cols-1 xl:grid-cols-4 2xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3 2xl:col-span-3">
            <RecentClaimsTable />
          </div>
          <div className="xl:col-span-1 2xl:col-span-1 space-y-6">
            <SubmissionQueueWidget />
            <ActivityTimeline />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}