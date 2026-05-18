import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  TrendingDown,
  ScanLine,
  FileCheck,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import type { DashboardMetric } from '@/lib/demoData';

const metricIcons = {
  'metric-validation-rate': ShieldCheck,
  'metric-attention': AlertTriangle,
  'metric-pending': Clock,
  'metric-rejection': TrendingDown,
  'metric-ocr': ScanLine,
  'metric-docs': FileCheck,
};

const toneClassNames = {
  success: { iconBg: 'bg-success-bg', iconColor: 'text-success' },
  danger: { iconBg: 'bg-danger-bg', iconColor: 'text-danger' },
  warning: { iconBg: 'bg-warning-bg', iconColor: 'text-warning' },
  info: { iconBg: 'bg-info-bg', iconColor: 'text-info' },
  muted: { iconBg: 'bg-secondary', iconColor: 'text-muted-foreground' },
};

export default function DashboardMetricsGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
      {metrics?.map((m) => {
        const Icon = metricIcons[m.id as keyof typeof metricIcons] || FileCheck;
        const tone = toneClassNames[m.tone];

        return (
          <div
            key={m?.id}
            className={`
            card p-5 relative overflow-hidden
            ${m?.highlight ? 'border-primary/20 bg-gradient-to-br from-white to-blue-50/40' : ''}
            ${m?.alert ? 'border-danger/20 bg-gradient-to-br from-white to-red-50/40' : ''}
            ${m?.colSpan}
          `}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${tone.iconBg} flex items-center justify-center`}>
                <Icon size={16} className={tone.iconColor} />
              </div>
              <div
                className={`flex items-center gap-1 text-xs font-semibold ${
                  m?.changeDir === 'up' ? 'text-success' : 'text-danger'
                }`}
              >
                {m?.changeDir === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {m?.change}
              </div>
            </div>

            <div className="mb-1">
              <span
                className={`font-bold font-tabular text-foreground ${m?.highlight ? 'text-4xl' : 'text-2xl'}`}
              >
                {m?.value}
              </span>
            </div>

            <p className="text-xs font-semibold text-foreground mb-0.5">{m?.label}</p>
            <p className="text-xs text-muted-foreground leading-snug">{m?.description}</p>

            <p className="text-xs text-muted-foreground mt-2 font-medium">{m?.changeLabel}</p>

            {m?.alert && (
              <div className="absolute top-2 right-2">
                <span className="w-2 h-2 rounded-full bg-danger block validation-pulse" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
