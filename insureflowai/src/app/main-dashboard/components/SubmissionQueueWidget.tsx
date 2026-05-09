import React from 'react';
import { Clock, ChevronRight, AlertCircle } from 'lucide-react';


const queueItems = [
  { id: 'q-001', claimId: 'CLM-2848', patient: 'Priya Nair', tpa: 'Star Health', score: 94, urgent: false },
  { id: 'q-002', claimId: 'CLM-2849', patient: 'Ramesh Iyer', tpa: 'HDFC ERGO', score: 98, urgent: false },
  { id: 'q-003', claimId: 'CLM-2843', patient: 'Ananya Bose', tpa: 'Max Bupa', score: 89, urgent: true },
  { id: 'q-004', claimId: 'CLM-2841', patient: 'Meena Krishnan', tpa: 'Bajaj Allianz', score: 96, urgent: false },
];

export default function SubmissionQueueWidget() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="section-header">Submission Queue</h3>
        <span className="badge-warning">
          <Clock size={10} /> 2h 14m left
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{queueItems?.length} claims ready for TPA submission</p>
      <div className="space-y-2.5">
        {queueItems?.map((item) => (
          <div
            key={item?.id}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer hover:bg-muted/50 ${
              item?.urgent ? 'border-warning/30 bg-warning-bg/50' : 'border-border'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {item?.urgent && <AlertCircle size={11} className="text-warning shrink-0" />}
                <span className="text-xs font-semibold text-foreground font-tabular">{item?.claimId}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{item?.patient} · {item?.tpa}</p>
            </div>
            <div className="text-right shrink-0">
              <span className={`text-sm font-bold font-tabular ${
                item?.score >= 90 ? 'text-success-foreground' : 'text-warning-foreground'
              }`}>{item?.score}</span>
              <p className="text-xs text-muted-foreground">score</p>
            </div>
            <ChevronRight size={14} className="text-muted-foreground shrink-0" />
          </div>
        ))}
      </div>
      <button className="btn-primary w-full mt-4 py-2.5">
        Submit All Ready Claims
      </button>
    </div>
  );
}