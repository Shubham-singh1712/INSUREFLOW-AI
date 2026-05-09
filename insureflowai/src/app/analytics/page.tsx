import React from 'react';
import { Activity, BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import SectionShell, { MetricCard } from '@/components/SectionShell';

const bars = [
  ['Mon', 68],
  ['Tue', 74],
  ['Wed', 81],
  ['Thu', 77],
  ['Fri', 92],
];

export default function AnalyticsPage() {
  return (
    <SectionShell
      currentPath="/analytics"
      title="Analytics"
      subtitle="Operational intelligence for claim throughput, AI accuracy, rejection prevention, and upload quality."
      action={<select className="input-field py-2 w-40"><option>Last 7 days</option><option>This month</option></select>}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Rejection Reduced" value="68%" helper="Projected prevention rate" tone="success" />
        <MetricCard label="AI Accuracy" value="97.3%" helper="Validated field confidence" tone="info" />
        <MetricCard label="Repair Rate" value="21%" helper="Claims needing intervention" tone="warning" />
        <MetricCard label="Avg Turnaround" value="8m" helper="Upload to readiness" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 size={18} className="text-primary" />
            <h2 className="section-header">Validation Throughput</h2>
          </div>
          <div className="h-64 flex items-end gap-5">
            {bars.map(([day, value]) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full bg-primary rounded-t-xl" style={{ height: `${Number(value) * 2}px` }} />
                <span className="text-xs text-muted-foreground">{day}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="section-header mb-4">Signals</h2>
          {[
            [TrendingUp, 'Clean claims up 14%', 'More packets passing first validation'],
            [TrendingDown, 'OCR failures down 9%', 'Upload quality guidance improving'],
            [Activity, '5 active bottlenecks', 'Mostly signature and invoice repairs'],
          ].map(([Icon, title, helper]) => {
            const TypedIcon = Icon as typeof Activity;
            return (
              <div key={String(title)} className="flex items-start gap-3 py-4 border-b border-border last:border-0">
                <TypedIcon size={17} className="text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{String(title)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{String(helper)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}
