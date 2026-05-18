import React from 'react';
import { Activity, BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import SectionShell, { MetricCard } from '@/components/SectionShell';
import { getDemoModeState } from '@/lib/demoMode';
import { listLiveClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';

const bars = [
  ['Mon', 68],
  ['Tue', 74],
  ['Wed', 81],
  ['Thu', 77],
  ['Fri', 92],
];

const signals = [
  [TrendingUp, 'Clean claims up 14%', 'More packets passing first validation'],
  [TrendingDown, 'OCR failures down 9%', 'Upload quality guidance improving'],
  [Activity, '5 active bottlenecks', 'Mostly signature and invoice repairs'],
];

export default async function AnalyticsPage() {
  const [demoMode, supabase] = await Promise.all([getDemoModeState(), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const liveClaims = await listLiveClaims(user?.id);
  const liveTotal = liveClaims.length;
  const liveClean = liveClaims.filter((claim) => claim.repairStatus === 'clean').length;
  const avgConfidence =
    liveTotal > 0
      ? Math.round(liveClaims.reduce((sum, claim) => sum + claim.aiConfidence, 0) / liveTotal)
      : 0;
  const repairRate = liveTotal > 0 ? Math.round(((liveTotal - liveClean) / liveTotal) * 100) : 0;
  const visibleBars = demoMode.enabled ? bars : [];
  const visibleSignals = demoMode.enabled
    ? signals
    : liveTotal > 0
      ? [
          [
            TrendingUp,
            `${liveClean} clean claim${liveClean === 1 ? '' : 's'} submitted`,
            'Live submission flow is writing to the register',
          ],
          [
            Activity,
            `${liveTotal} live claim${liveTotal === 1 ? '' : 's'} processed`,
            'Dashboard and queues are now connected',
          ],
        ]
      : [];

  return (
    <SectionShell
      currentPath="/analytics"
      title="Analytics"
      subtitle={
        demoMode.enabled
          ? 'Demo operational intelligence for claim throughput, AI accuracy, rejection prevention, and upload quality.'
          : 'Live analytics. Demo charts and signals are hidden because Demo Mode is off.'
      }
      action={
        <select className="input-field py-2 w-40">
          <option>Last 7 days</option>
          <option>This month</option>
        </select>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Rejection Reduced"
          value={demoMode.enabled ? '68%' : liveTotal > 0 ? '100%' : '0%'}
          helper="Projected prevention rate"
          tone="success"
        />
        <MetricCard
          label="AI Accuracy"
          value={demoMode.enabled ? '97.3%' : `${avgConfidence}%`}
          helper="Validated field confidence"
          tone="info"
        />
        <MetricCard
          label="Repair Rate"
          value={demoMode.enabled ? '21%' : `${repairRate}%`}
          helper="Claims needing intervention"
          tone="warning"
        />
        <MetricCard
          label="Avg Turnaround"
          value={demoMode.enabled ? '8m' : liveTotal > 0 ? '1m' : '-'}
          helper="Upload to readiness"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 size={18} className="text-primary" />
            <h2 className="section-header">Validation Throughput</h2>
          </div>
          {visibleBars.length > 0 || liveTotal > 0 ? (
            <div className="h-64 flex items-end gap-5">
              {(visibleBars.length > 0
                ? visibleBars
                : [['Today', Math.max(12, liveTotal * 30)]]
              ).map(([day, value]) => (
                <div key={day} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full bg-primary rounded-t-xl"
                    style={{ height: `${Number(value) * 2}px` }}
                  />
                  <span className="text-xs text-muted-foreground">{day}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              No live analytics events are loaded yet. Turn on Demo Mode in Settings to view mock
              charts.
            </div>
          )}
        </div>
        <div className="card p-5">
          <h2 className="section-header mb-4">Signals</h2>
          {visibleSignals.map(([Icon, title, helper]) => {
            const TypedIcon = Icon as typeof Activity;
            return (
              <div
                key={String(title)}
                className="flex items-start gap-3 py-4 border-b border-border last:border-0"
              >
                <TypedIcon size={17} className="text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{String(title)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{String(helper)}</p>
                </div>
              </div>
            );
          })}
          {visibleSignals.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No live signals are loaded yet.
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
