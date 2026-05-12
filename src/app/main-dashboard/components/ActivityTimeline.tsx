import React from 'react';
import { ShieldCheck, Upload, AlertTriangle, CheckCircle2, FileText, XCircle } from 'lucide-react';

const activities = [
  {
    id: 'act-001',
    icon: CheckCircle2,
    iconClass: 'text-success',
    bgClass: 'bg-success-bg',
    message: 'CLM-2848 passed all AI validations',
    sub: 'Priya Nair · Star Health',
    time: '4m ago',
  },
  {
    id: 'act-002',
    icon: AlertTriangle,
    iconClass: 'text-danger',
    bgClass: 'bg-danger-bg',
    message: 'Signature missing on discharge summary — CLM-2847',
    sub: 'Arjun Mehta · Apollo Munich',
    time: '11m ago',
  },
  {
    id: 'act-003',
    icon: Upload,
    iconClass: 'text-info',
    bgClass: 'bg-info-bg',
    message: 'New claim CLM-2851 uploaded — 5 documents',
    sub: 'Venkat Reddy · Apollo Munich',
    time: '23m ago',
  },
  {
    id: 'act-004',
    icon: ShieldCheck,
    iconClass: 'text-primary',
    bgClass: 'bg-primary/10',
    message: 'CLM-2849 submitted to HDFC ERGO',
    sub: 'Ramesh Iyer · ₹3,21,000',
    time: '41m ago',
  },
  {
    id: 'act-005',
    icon: XCircle,
    iconClass: 'text-danger',
    bgClass: 'bg-danger-bg',
    message: 'OCR failed — insurance card unreadable CLM-2851',
    sub: 'Re-upload required',
    time: '1h ago',
  },
  {
    id: 'act-006',
    icon: FileText,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted',
    message: 'Master PDF generated for CLM-2841',
    sub: 'Meena Krishnan · Bajaj Allianz',
    time: '2h ago',
  },
];

export default function ActivityTimeline() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-header">Activity Feed</h3>
        <button className="text-xs text-primary font-medium hover:underline">View all</button>
      </div>
      <div className="space-y-3">
        {activities?.map((act) => (
          <div key={act?.id} className="flex items-start gap-3">
            <div className={`w-7 h-7 rounded-xl ${act?.bgClass} flex items-center justify-center shrink-0 mt-0.5`}>
              <act.icon size={13} className={act?.iconClass} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground leading-snug font-medium">{act?.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{act?.sub}</p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{act?.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}