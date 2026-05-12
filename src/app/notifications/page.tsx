import React from 'react';
import { AlertTriangle, Bell, CheckCircle2, Clock } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { getDemoModeState } from '@/lib/demoMode';

const alerts = [
  [
    AlertTriangle,
    'CLM-2847 missing signature',
    'Discharge summary requires signed copy before submission.',
    'Critical',
  ],
  [Clock, 'Submission window closing', 'Apollo Munich batch closes at 5:00 PM today.', 'Soon'],
  [CheckCircle2, 'CLM-2839 submitted', 'EDI payload accepted into TPA queue.', 'Done'],
  [Bell, 'OCR retry finished', 'Insurance card extraction improved to 91% confidence.', 'Update'],
];

export default async function NotificationsPage() {
  const demoMode = await getDemoModeState();
  const visibleAlerts = demoMode.enabled ? alerts : [];

  return (
    <SectionShell
      currentPath="/notifications"
      title="Notifications"
      subtitle={
        demoMode.enabled
          ? 'Demo operational alerts for claim risks, upload quality, and submission deadlines.'
          : 'Live notifications. Demo alerts are hidden because Demo Mode is off.'
      }
      action={<button className="btn-secondary">Mark all read</button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Unread"
          value={demoMode.enabled ? '7' : '0'}
          helper="Needs attention"
          tone="warning"
        />
        <MetricCard
          label="Critical"
          value={demoMode.enabled ? '2' : '0'}
          helper="Likely rejection blockers"
          tone="danger"
        />
        <MetricCard
          label="Resolved Today"
          value={demoMode.enabled ? '13' : '0'}
          helper="Closed by team actions"
          tone="success"
        />
      </div>

      <div className="card divide-y divide-border">
        {visibleAlerts.map(([Icon, title, helper, status]) => {
          const TypedIcon = Icon as typeof Bell;
          return (
            <div key={String(title)} className="p-5 flex items-start gap-4 hover:bg-muted/40">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <TypedIcon
                  size={18}
                  className={
                    status === 'Critical'
                      ? 'text-danger'
                      : status === 'Done'
                        ? 'text-success'
                        : 'text-primary'
                  }
                />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{String(title)}</p>
                <p className="text-sm text-muted-foreground mt-1">{String(helper)}</p>
              </div>
              <StatusPill
                tone={status === 'Critical' ? 'danger' : status === 'Done' ? 'success' : 'info'}
              >
                {String(status)}
              </StatusPill>
            </div>
          );
        })}
        {visibleAlerts.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No live notifications are loaded yet. Turn on Demo Mode in Settings to view mock alerts.
          </div>
        )}
      </div>
    </SectionShell>
  );
}
