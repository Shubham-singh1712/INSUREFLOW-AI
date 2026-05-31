'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  ChevronUp,
  ChevronDown,
  Eye,
  Edit3,
  MoreHorizontal,
  AlertTriangle,
} from 'lucide-react';
import type { DashboardClaim as Claim } from '@/lib/demoData';
import { getClaimStatusLabel, getClaimStatusTone, isValidationRequired } from '@/lib/claimLifecycle';

const repairStatusConfig = {
  clean: { label: 'AI Verified', className: 'badge-success' },
  ready: { label: 'Ready to Submit', className: 'badge-success' },
  repairs_pending: { label: 'Repairs Pending', className: 'badge-warning' },
  signature_missing: { label: 'Signature Missing', className: 'badge-danger' },
  ocr_failed: { label: 'OCR Failed', className: 'badge-danger' },
};

export default function RecentClaimsTable({ claims }: { claims: Claim[] }) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<keyof Claim>('claimId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const perPage = 8;

  const filtered = claims.filter(
    (claim) =>
      claim.patient.toLowerCase().includes(search.toLowerCase()) ||
      claim.claimId.toLowerCase().includes(search.toLowerCase()) ||
      claim.tpa.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortCol];
    const bVal = b[sortCol];
    const dir = sortDir === 'asc' ? 1 : -1;
    if (typeof aVal === 'string' && typeof bVal === 'string') return aVal.localeCompare(bVal) * dir;
    if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir;
    return 0;
  });

  const paginated = sorted.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));

  const toggleSort = (col: keyof Claim) => {
    if (sortCol === col) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === paginated.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(paginated.map((claim) => claim.id)));
  };

  const SortIcon = ({ col }: { col: keyof Claim }) => (
    <span className="flex flex-col gap-px ml-1 opacity-40">
      <ChevronUp
        size={10}
        className={sortCol === col && sortDir === 'asc' ? 'opacity-100 text-primary' : ''}
      />
      <ChevronDown
        size={10}
        className={sortCol === col && sortDir === 'desc' ? 'opacity-100 text-primary' : ''}
      />
    </span>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="section-header">Recent Claims</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} claims -{' '}
            {
              claims.filter((claim) => isValidationRequired(claim.status)).length
            }{' '}
            need attention
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search claims..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-8 pr-3 py-2 text-sm border border-border rounded-xl bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:bg-white w-52 transition-all"
            />
          </div>
          <button className="btn-secondary py-2 gap-1.5">
            <Filter size={13} /> Filter
          </button>
        </div>
      </div>

      {selectedRows.size > 0 && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-primary/5 border-b border-primary/10 slide-up">
          <span className="text-sm font-medium text-primary">{selectedRows.size} selected</span>
          <div className="h-4 w-px bg-primary/20" />
          <button className="text-sm text-primary font-medium hover:underline">
            Submit Selected
          </button>
          <button className="text-sm text-primary font-medium hover:underline">Export</button>
          <button className="text-sm text-danger font-medium hover:underline ml-auto">
            Delete
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedRows.size === paginated.length && paginated.length > 0}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded border-border text-primary"
                />
              </th>
              {[
                { key: 'claimId', label: 'Claim ID' },
                { key: 'patient', label: 'Patient' },
                { key: 'tpa', label: 'TPA' },
                { key: 'documents', label: 'Documents' },
                { key: 'aiConfidence', label: 'AI Confidence' },
                { key: 'repairStatus', label: 'Repair Status' },
                { key: 'submissionScore', label: 'Sub. Score' },
                { key: 'amount', label: 'Claim Amount' },
                { key: 'status', label: 'Status' },
              ].map((col) => (
                <th
                  key={`th-${col.key}`}
                  className="px-4 py-3 text-left font-semibold text-xs text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground whitespace-nowrap"
                  onClick={() => toggleSort(col.key as keyof Claim)}
                >
                  <span className="flex items-center">
                    {col.label}
                    <SortIcon col={col.key as keyof Claim} />
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold text-xs text-muted-foreground uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((claim) => {
              const repairCfg = repairStatusConfig[claim.repairStatus];
              const isSelected = selectedRows.has(claim.id);
              const isAlert = isValidationRequired(claim.status);

              return (
                <tr
                  key={claim.id}
                  className={`group transition-colors ${
                    isSelected
                      ? 'bg-primary/5'
                      : isAlert
                        ? 'bg-danger-bg/30 hover:bg-danger-bg/50'
                        : 'hover:bg-muted/50'
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(claim.id)}
                      className="w-4 h-4 rounded border-border text-primary"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {isAlert && <AlertTriangle size={13} className="text-danger shrink-0" />}
                      <span className="font-semibold text-foreground font-tabular">
                        {claim.claimId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="font-medium text-foreground">{claim.patient}</p>
                      <p className="text-xs text-muted-foreground">Age {claim.age}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                    {claim.tpa}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: claim.documents.total }).map((_, i) => (
                          <div
                            key={`doc-${claim.id}-${i}`}
                            className={`w-2 h-2 rounded-sm ${i < claim.documents.passed ? 'bg-success' : 'bg-danger'}`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground font-tabular">
                        {claim.documents.passed}/{claim.documents.total}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full confidence-fill ${
                            claim.aiConfidence >= 85
                              ? 'bg-success'
                              : claim.aiConfidence >= 65
                                ? 'bg-warning'
                                : 'bg-danger'
                          }`}
                          style={{ width: `${claim.aiConfidence}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-semibold font-tabular ${
                          claim.aiConfidence >= 85
                            ? 'text-success-foreground'
                            : claim.aiConfidence >= 65
                              ? 'text-warning-foreground'
                              : 'text-danger-foreground'
                        }`}
                      >
                        {claim.aiConfidence}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={repairCfg.className}>{repairCfg.label}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          claim.submissionScore >= 85
                            ? 'bg-success'
                            : claim.submissionScore >= 60
                              ? 'bg-warning'
                              : 'bg-danger'
                        }`}
                      />
                      <span className="font-semibold text-foreground font-tabular text-sm">
                        {claim.submissionScore}
                      </span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-tabular font-medium text-foreground">
                    {claim.amount}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`badge-${getClaimStatusTone(claim.status)}`}>
                      {getClaimStatusLabel(claim.status)}
                    </span>
                  </td>
                   <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/claim-intake-document-upload?claimId=${encodeURIComponent(claim.claimId)}`}
                        title="View claim details"
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Eye size={14} />
                      </Link>
                      <Link
                        href={`/claim-intake-document-upload?claimId=${encodeURIComponent(claim.claimId)}`}
                        title="Edit claim"
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Edit3 size={14} />
                      </Link>
                      <button
                        title="More actions"
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-center text-muted-foreground" colSpan={11}>
                  No live claims are loaded yet. Upload a claim in Demo Mode or process a PDF to populate the dashboard.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-3.5 border-t border-border">
        <p className="text-xs text-muted-foreground font-tabular">
          Showing {sorted.length === 0 ? 0 : (page - 1) * perPage + 1}-
          {Math.min(page * perPage, sorted.length)} of {sorted.length} claims
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={`page-${i + 1}`}
              onClick={() => setPage(i + 1)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                page === i + 1
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
