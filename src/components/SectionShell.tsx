import React from 'react';
import AppLayout from './AppLayout';

interface SectionShellProps {
  currentPath: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function SectionShell({ currentPath, title, subtitle, action, children }: SectionShellProps) {
  return (
    <AppLayout currentPath={currentPath}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {action}
        </div>
        {children}
      </div>
    </AppLayout>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  tone = 'primary',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const toneMap = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    danger: 'bg-danger-bg text-danger',
    info: 'bg-info-bg text-info',
  };

  return (
    <div className="card p-5">
      <div className={`w-2 h-2 rounded-full mb-4 ${toneMap[tone].split(' ')[0]}`} />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground font-tabular mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{helper}</p>
    </div>
  );
}

export function StatusPill({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'success' | 'warning' | 'danger' | 'info' | 'muted' }) {
  const classMap = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    muted: 'badge-muted',
  };

  return <span className={classMap[tone]}>{children}</span>;
}
