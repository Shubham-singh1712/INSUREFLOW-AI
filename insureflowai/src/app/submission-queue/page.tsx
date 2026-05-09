import React from 'react';
import { Clock, Send, UploadCloud } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';

export default function SubmissionQueuePage() {
  return (
    <SectionShell
      currentPath="/submission-queue"
      title="Submission Queue"
      subtitle="Dispatch UB-04 and EDI 837I packets to TPA queues within today’s submission window."
      action={<button className="btn-primary gap-2"><Send size={15} /> Submit Ready Claims</button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Ready Now" value="2" helper="Passed all checks" tone="success" />
        <MetricCard label="Queued" value="7" helper="Waiting for batch dispatch" tone="info" />
        <MetricCard label="Window Closes" value="2h 14m" helper="Apollo Munich TPA batch" tone="warning" />
        <MetricCard label="Submitted Today" value="16" helper="Across all TPAs" />
      </div>

      <div className="card p-5">
        <div className="space-y-4">
          {[
            ['CLM-2848', 'Star Health', 'UB-04 + EDI ready', 'Ready'],
            ['CLM-2849', 'HDFC ERGO', 'Master PDF generated', 'Ready'],
            ['CLM-2843', 'Max Bupa', 'Awaiting 5 PM batch', 'Queued'],
          ].map(([claim, tpa, detail, status]) => (
            <div key={claim} className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border">
              <div className="w-10 h-10 rounded-xl bg-info-bg flex items-center justify-center">
                {status === 'Ready' ? <UploadCloud size={18} className="text-info" /> : <Clock size={18} className="text-warning" />}
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground font-tabular">{claim}</p>
                <p className="text-sm text-muted-foreground">{tpa} - {detail}</p>
              </div>
              <StatusPill tone={status === 'Ready' ? 'success' : 'info'}>{status}</StatusPill>
              <button className="btn-secondary">Preview</button>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
