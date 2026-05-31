import React from 'react';
import { ShieldCheck, Upload, AlertTriangle, CheckCircle2, FileText, XCircle, Clock } from 'lucide-react';
import { listLiveClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';

export default async function ActivityTimeline() {
  let user: any = null;
  let liveClaims: any[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch (err: any) {
    console.error('Supabase auth failed in ActivityTimeline:', err.message);
  }

  try {
    liveClaims = await listLiveClaims(user?.id);
  } catch (err: any) {
    console.error('Failed to load live claims in ActivityTimeline:', err.message);
    try {
      liveClaims = await listLiveClaims(null);
    } catch {}
  }

  // Collect all audit logs from all claims
  const allEvents: Array<{
    id: string;
    claimId: string;
    patient: string;
    tpa: string;
    amount: string;
    action: string;
    details: string;
    timestamp: string;
  }> = [];

  for (const claim of liveClaims) {
    if (claim.auditLogs && Array.isArray(claim.auditLogs)) {
      claim.auditLogs.forEach((log: any, idx: number) => {
        allEvents.push({
          id: `${claim.claimId}-${idx}-${log.timestamp || log.created_at}`,
          claimId: claim.claimId,
          patient: claim.patient || 'Unknown Patient',
          tpa: claim.tpa || 'Unknown TPA',
          amount: claim.amount || 'INR 0',
          action: log.action || log.stage || 'Log',
          details: log.details || log.message || '',
          timestamp: log.timestamp || log.created_at || claim.submittedAt || new Date().toISOString()
        });
      });
    }
  }

  // Sort by timestamp descending
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Take top 8 events
  const visibleEvents = allEvents.slice(0, 8);

  const getIconConfig = (action: string) => {
    const act = String(action || '').toUpperCase();
    if (act.includes('UPLOAD')) {
      return { icon: Upload, iconClass: 'text-info', bgClass: 'bg-info-bg' };
    }
    if (act.includes('PROCESSING') || act.includes('OCR') || act.includes('CLASSIF') || act.includes('EXTRACT')) {
      return { icon: FileText, iconClass: 'text-muted-foreground', bgClass: 'bg-muted' };
    }
    if (act.includes('VALIDATION_REQUIRED') || act.includes('REVIEW') || act.includes('VALIDATION REQUIRED')) {
      return { icon: AlertTriangle, iconClass: 'text-warning', bgClass: 'bg-warning-bg' };
    }
    if (act.includes('READY_TO_SUBMIT') || act.includes('READY')) {
      return { icon: CheckCircle2, iconClass: 'text-success', bgClass: 'bg-success-bg' };
    }
    if (act.includes('SUBMIT')) {
      return { icon: ShieldCheck, iconClass: 'text-primary', bgClass: 'bg-primary/10' };
    }
    if (act.includes('APPROVE')) {
      return { icon: CheckCircle2, iconClass: 'text-success', bgClass: 'bg-success-bg' };
    }
    if (act.includes('REJECT')) {
      return { icon: XCircle, iconClass: 'text-danger', bgClass: 'bg-danger-bg' };
    }
    return { icon: Clock, iconClass: 'text-info', bgClass: 'bg-info-bg' };
  };

  const formatTime = (ts: string) => {
    const diffMs = Date.now() - new Date(ts).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getEventMessage = (event: typeof allEvents[0]) => {
    const act = String(event.action || '').toUpperCase();
    const claimPart = event.claimId;
    if (act === 'CLAIM UPLOADED' || act === 'UPLOADED') {
      return `${claimPart} uploaded`;
    }
    if (act === 'PROCESSING' || act === 'AI PROCESSING INITIATED') {
      return `${claimPart}: AI processing initiated`;
    }
    if (act === 'EXTRACTED' || act === 'AI PROCESSING COMPLETED') {
      return `${claimPart}: AI processing completed`;
    }
    if (act === 'VALIDATION_REQUIRED' || act === 'REVIEW_REQUIRED') {
      return `${claimPart}: Validation required — ${event.details || 'issues detected'}`;
    }
    if (act === 'READY_TO_SUBMIT' || act === 'READY') {
      return `${claimPart} ready for submission`;
    }
    if (act === 'SUBMITTED' || act === 'CLAIM SUBMITTED') {
      return `${claimPart} submitted`;
    }
    if (act === 'APPROVED') {
      return `${claimPart} approved`;
    }
    if (act === 'REJECTED') {
      return `${claimPart} rejected`;
    }
    return `${claimPart}: ${event.details || event.action}`;
  };

  return (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-header">Activity Feed</h3>
      </div>
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {visibleEvents.map((event) => {
          const cfg = getIconConfig(event.action);
          const Icon = cfg.icon;
          const message = getEventMessage(event);
          const sub = `${event.patient} · ${event.tpa}`;

          return (
            <div key={event.id} className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-xl ${cfg.bgClass} flex items-center justify-center shrink-0 mt-0.5`}>
                <Icon size={13} className={cfg.iconClass} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground leading-snug font-medium">{message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                {formatTime(event.timestamp)}
              </span>
            </div>
          );
        })}
        {visibleEvents.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No activity events recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}
