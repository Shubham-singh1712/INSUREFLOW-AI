import React from 'react';
import Link from 'next/link';
import { Filter, Search, SlidersHorizontal } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { listLiveClaims } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';
import {
  getClaimStatusLabel,
  getClaimStatusTone,
  isReadyForSubmission,
  isUnderReview,
} from '@/lib/claimLifecycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AllClaimsPage() {
  let user: any = null;
  let liveClaims: any[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch (err: any) {
    console.error('Supabase auth check failed in All Claims Page:', err.message);
  }

  try {
    liveClaims = await listLiveClaims(user?.id);
  } catch (err: any) {
    console.error('Failed to load live claims in All Claims Page:', err.message);
    try {
      liveClaims = await listLiveClaims(null);
    } catch (fallbackErr: any) {
      console.error('Fallback load failed in All Claims Page:', fallbackErr.message);
    }
  }

  const needsAttention = liveClaims.filter((claim) => isUnderReview(claim.status)).length;
  const readyCount = liveClaims.filter((claim) => isReadyForSubmission(claim.status)).length;
  const highRiskCount = liveClaims.filter((claim) => claim.rejectionRisk === 'high').length;

  return (
    <SectionShell
      currentPath="/all-claims"
      title="All Claims"
      subtitle="Live Claim Register showing real-time insurance operations and processing records."
      action={
        <Link href="/claim-intake-document-upload" className="btn-primary">
          + New Claim
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Claims"
          value={String(liveClaims.length)}
          helper="Across active hospital workspace"
        />
        <MetricCard
          label="Pending Review"
          value={String(needsAttention)}
          helper="Claims in the validation working queue"
          tone={needsAttention > 0 ? 'warning' : 'muted'}
        />
        <MetricCard
          label="Ready To Submit"
          value={String(readyCount)}
          helper="Approved by validation and waiting for submission"
          tone="success"
        />
        <MetricCard
          label="High Rejection Risk"
          value={String(highRiskCount)}
          helper="High-risk claims flagged by AI"
          tone={highRiskCount > 0 ? 'danger' : 'muted'}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="input-field pl-9 py-2"
              placeholder="Search claims, patients, TPAs..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary gap-2">
              <Filter size={14} /> Filter
            </button>
            <button className="btn-secondary gap-2">
              <SlidersHorizontal size={14} /> Columns
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {['Claim ID', 'Patient', 'Hospital', 'Status', 'Health', 'Risk', 'Created Date'].map((head) => (
                <th
                  key={head}
                  className="px-5 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {liveClaims.map((claim) => {
              const dateVal = claim.createdAt || claim.submittedAt;
              const formattedDate = dateVal
                ? new Date(dateVal).toLocaleDateString([], {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                  })
                : 'Recent';

              return (
                <tr key={claim.claimId} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-4 font-bold font-tabular text-foreground">
                    <Link
                      href={`/claim-intake-document-upload?claimId=${encodeURIComponent(claim.claimId)}`}
                      className="text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {claim.claimId}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-foreground font-semibold">{claim.patient}</td>
                  <td className="px-5 py-4 text-muted-foreground">{claim.hospitalName || 'Unknown Hospital'}</td>
                  <td className="px-5 py-4">
                    <StatusPill tone={getClaimStatusTone(claim.status)}>
                      {getClaimStatusLabel(claim.status)}
                    </StatusPill>
                  </td>
                  <td className="px-5 py-4 font-tabular font-semibold text-foreground">
                    {claim.claimHealth || claim.aiConfidence}%
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill
                      tone={
                        claim.rejectionRisk === 'low'
                          ? 'success'
                          : claim.rejectionRisk === 'medium'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {claim.rejectionRisk ? claim.rejectionRisk.toUpperCase() : 'LOW'}
                    </StatusPill>
                  </td>
                  <td className="px-5 py-4 font-tabular text-muted-foreground">{formattedDate}</td>
                </tr>
              );
            })}
            {liveClaims.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-center text-muted-foreground" colSpan={7}>
                  No live claims are loaded yet. Create and submit a claim to populate the live register.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}
