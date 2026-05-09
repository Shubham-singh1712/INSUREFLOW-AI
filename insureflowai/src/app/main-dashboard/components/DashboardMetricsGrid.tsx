import React from 'react';
import { ShieldCheck, AlertTriangle, Clock, TrendingDown, ScanLine, FileCheck, ArrowUpRight, ArrowDownRight,  } from 'lucide-react';

const metrics = [
  {
    id: 'metric-validation-rate',
    label: 'Validation Success Rate',
    value: '91.4%',
    change: '+3.2%',
    changeDir: 'up',
    changeLabel: 'vs. yesterday',
    icon: ShieldCheck,
    iconBg: 'bg-success-bg',
    iconColor: 'text-success',
    highlight: true,
    description: 'Claims passing AI validation without manual repair',
    colSpan: 'col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2 2xl:col-span-2',
  },
  {
    id: 'metric-attention',
    label: 'Claims Requiring Attention',
    value: '5',
    change: '+2',
    changeDir: 'down',
    changeLabel: 'since 9 AM',
    icon: AlertTriangle,
    iconBg: 'bg-danger-bg',
    iconColor: 'text-danger',
    alert: true,
    description: 'Unresolved repair suggestions blocking submission',
    colSpan: 'col-span-1',
  },
  {
    id: 'metric-pending',
    label: 'Pending Submissions',
    value: '12',
    change: '-4',
    changeDir: 'up',
    changeLabel: 'submitted today',
    icon: Clock,
    iconBg: 'bg-warning-bg',
    iconColor: 'text-warning',
    description: 'Claims ready or near-ready for TPA submission',
    colSpan: 'col-span-1',
  },
  {
    id: 'metric-rejection',
    label: 'TPA Rejection Rate',
    value: '4.7%',
    change: '-1.3%',
    changeDir: 'up',
    changeLabel: 'vs. last week',
    icon: TrendingDown,
    iconBg: 'bg-success-bg',
    iconColor: 'text-success',
    description: 'Claims rejected after TPA submission this month',
    colSpan: 'col-span-1',
  },
  {
    id: 'metric-ocr',
    label: 'OCR Extraction Accuracy',
    value: '96.8%',
    change: '+0.4%',
    changeDir: 'up',
    changeLabel: 'vs. yesterday',
    icon: ScanLine,
    iconBg: 'bg-info-bg',
    iconColor: 'text-info',
    description: 'Documents with successful text extraction',
    colSpan: 'col-span-1',
  },
  {
    id: 'metric-docs',
    label: 'Documents Processed Today',
    value: '347',
    change: '+61',
    changeDir: 'up',
    changeLabel: 'vs. daily avg',
    icon: FileCheck,
    iconBg: 'bg-secondary',
    iconColor: 'text-muted-foreground',
    description: 'Total documents scanned and validated today',
    colSpan: 'col-span-1',
  },
];

export default function DashboardMetricsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
      {metrics?.map((m) => (
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
            <div className={`w-9 h-9 rounded-xl ${m?.iconBg} flex items-center justify-center`}>
              <m.icon size={16} className={m?.iconColor} />
            </div>
            <div className={`flex items-center gap-1 text-xs font-semibold ${
              m?.changeDir === 'up' ? 'text-success' : 'text-danger'
            }`}>
              {m?.changeDir === 'up'
                ? <ArrowUpRight size={13} />
                : <ArrowDownRight size={13} />
              }
              {m?.change}
            </div>
          </div>

          <div className="mb-1">
            <span className={`font-bold font-tabular text-foreground ${m?.highlight ? 'text-4xl' : 'text-2xl'}`}>
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
      ))}
    </div>
  );
}