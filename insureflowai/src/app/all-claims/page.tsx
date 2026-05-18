import React from 'react';
import Link from 'next/link';
import { Filter, Search, SlidersHorizontal } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';
import { demoClaimRegisterRows } from '@/lib/demoData';
import { getDemoModeState } from '@/lib/demoMode';
import { listLiveClaims, toClaimRegisterRows } from '@/lib/liveClaims';
import { createClient } from '@/lib/supabase/server';

export default async function AllClaimsPage() {
  const [demoMode, supabase] = await Promise.all([getDemoModeState(), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const liveClaims = await listLiveClaims(user?.id);
  const claims = demoMode.enabled ? demoClaimRegisterRows : toClaimRegisterRows(liveClaims);
  const needsAttention = liveClaims.filter((claim) => claim.repairStatus !== 'clean').length;
  const readyOrSubmitted = liveClaims.filter((claim) => claim.repairStatus === 'clean').length;

  return (
    <SectionShell
      currentPath="/all-claims"
      title="All Claims"
      subtitle={
        demoMode.enabled
          ? 'Demo register populated with mock claims. Turn demo mode off in Settings to hide fixture data.'
          : 'Live claim register. Demo fixtures are hidden because demo mode is off.'
      }
      action={
        <Link href="/claim-intake-document-upload" className="btn-primary">
          + New Claim
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Claims"
          value={demoMode.enabled ? '284' : String(liveClaims.length)}
          helper="Across active hospital workspace"
        />
        <MetricCard
          label="Need Attention"
          value={demoMode.enabled ? '18' : String(needsAttention)}
          helper="OCR, signature, or compliance issues"
          tone="warning"
        />
        <MetricCard
          label="Ready"
          value={demoMode.enabled ? '42' : String(readyOrSubmitted)}
          helper="Validated and submission-ready"
          tone="success"
        />
        <MetricCard
          label="Rejected Risk"
          value={demoMode.enabled ? '7' : '0'}
          helper="High-risk claims flagged by AI"
          tone="danger"
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
              {['Claim ID', 'Patient', 'TPA', 'Issue', 'Score', 'Status'].map((head) => (
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
            {claims.map(({ id, patient, tpa, issue, score, status }) => (
              <tr key={id} className="hover:bg-muted/40">
                <td className="px-5 py-4 font-bold font-tabular text-foreground">{id}</td>
                <td className="px-5 py-4 text-foreground">{patient}</td>
                <td className="px-5 py-4 text-muted-foreground">{tpa}</td>
                <td className="px-5 py-4 text-muted-foreground">{issue}</td>
                <td className="px-5 py-4 font-tabular font-semibold">{score}/100</td>
                <td className="px-5 py-4">
                  <StatusPill
                    tone={
                      status === 'Ready'
                        ? 'success'
                        : status === 'Blocked'
                          ? 'danger'
                          : status === 'Needs Repair'
                            ? 'warning'
                            : 'info'
                    }
                  >
                    {status}
                  </StatusPill>
                </td>
              </tr>
            ))}
            {claims.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-center text-muted-foreground" colSpan={6}>
                  No live claims are loaded yet. Create and submit a claim to populate the live
                  register.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}
