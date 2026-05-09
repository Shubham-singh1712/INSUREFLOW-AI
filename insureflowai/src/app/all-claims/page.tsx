import React from 'react';
import { Filter, Search, SlidersHorizontal } from 'lucide-react';
import SectionShell, { MetricCard, StatusPill } from '@/components/SectionShell';

const claims = [
  ['CLM-2847', 'Arjun Mehta', 'Apollo Munich', 'Missing signature', '62', 'Needs Repair'],
  ['CLM-2848', 'Priya Nair', 'Star Health', 'Clean packet', '94', 'Ready'],
  ['CLM-2849', 'Ramesh Iyer', 'HDFC ERGO', 'AI verified', '98', 'Ready'],
  ['CLM-2851', 'Venkat Reddy', 'Apollo Munich', 'OCR failed', '28', 'Blocked'],
  ['CLM-2843', 'Ananya Bose', 'Max Bupa', 'Queued for dispatch', '89', 'Queued'],
];

export default function AllClaimsPage() {
  return (
    <SectionShell
      currentPath="/all-claims"
      title="All Claims"
      subtitle="A searchable operational register for every claim moving through intake, validation, repair, and submission."
      action={<button className="btn-primary">+ New Claim</button>}
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Total Claims" value="284" helper="Across active hospital workspace" />
        <MetricCard label="Need Attention" value="18" helper="OCR, signature, or compliance issues" tone="warning" />
        <MetricCard label="Ready" value="42" helper="Validated and submission-ready" tone="success" />
        <MetricCard label="Rejected Risk" value="7" helper="High-risk claims flagged by AI" tone="danger" />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="input-field pl-9 py-2" placeholder="Search claims, patients, TPAs..." />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary gap-2"><Filter size={14} /> Filter</button>
            <button className="btn-secondary gap-2"><SlidersHorizontal size={14} /> Columns</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {['Claim ID', 'Patient', 'TPA', 'Issue', 'Score', 'Status'].map((head) => (
                <th key={head} className="px-5 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {claims.map(([id, patient, tpa, issue, score, status]) => (
              <tr key={id} className="hover:bg-muted/40">
                <td className="px-5 py-4 font-bold font-tabular text-foreground">{id}</td>
                <td className="px-5 py-4 text-foreground">{patient}</td>
                <td className="px-5 py-4 text-muted-foreground">{tpa}</td>
                <td className="px-5 py-4 text-muted-foreground">{issue}</td>
                <td className="px-5 py-4 font-tabular font-semibold">{score}/100</td>
                <td className="px-5 py-4">
                  <StatusPill tone={status === 'Ready' ? 'success' : status === 'Blocked' ? 'danger' : status === 'Needs Repair' ? 'warning' : 'info'}>
                    {status}
                  </StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
}
