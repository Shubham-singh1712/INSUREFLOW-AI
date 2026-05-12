'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2, Clock3, AlertTriangle, ShieldAlert, Gauge,
  FileText, Wand2, Download, ClipboardCheck, Sparkles,
  ChevronDown, ChevronRight, ArrowRight, RotateCcw, X,
} from 'lucide-react';
import { Packet, ClaimField, ClaimFieldKey } from './ClaimIntakeFlow';

interface AnalysisResultsProps {
  claimId: string;
  packet: Packet;
  claimFields: ClaimField[];
  onUpdateField: (id: ClaimFieldKey, value: string) => void;
  onReset: () => void;
}

const documentGroups = [
  { id: 'insurance-card', title: 'Insurance Card', pages: 'Page 1', confidence: 98, status: 'Verified', summary: 'Member ID, payer ID and plan name detected.', tone: 'success' },
  { id: 'discharge-summary', title: 'Discharge Summary', pages: 'Pages 2–4', confidence: 94, status: 'Signature review', summary: 'Diagnosis and discharge date extracted. Physician signature needs confirmation.', tone: 'warning' },
  { id: 'lab-reports', title: 'Lab Reports', pages: 'Pages 5–8', confidence: 91, status: 'Classified', summary: 'Four pages grouped by pathology header and report sequence numbers.', tone: 'info' },
  { id: 'invoice', title: 'Hospital Invoice', pages: 'Pages 9–12', confidence: 87, status: 'Low scan quality', summary: 'Totals extracted. Page 11 is slightly blurred — replacement recommended.', tone: 'danger' },
];

const validationMetrics = [
  { id: 'health', label: 'Claim Health', value: '82', unit: '/100', color: 'text-warning', helper: 'Moderate repair needed' },
  { id: 'readiness', label: 'Readiness', value: '76', unit: '%', color: 'text-warning', helper: '2 fixes before export' },
  { id: 'ocr', label: 'OCR Confidence', value: '93', unit: '%', color: 'text-success', helper: 'One blurry page found' },
  { id: 'risk', label: 'Rejection Risk', value: 'Med', unit: '', color: 'text-warning', helper: 'Signature mismatch risk' },
];

const issues = [
  { id: 'sig', severity: 'High', confidence: 91, title: 'Missing physician signature', reference: 'Discharge Summary · Page 4', fix: 'Upload signed discharge summary or request physician e-signature.' },
  { id: 'blur', severity: 'Medium', confidence: 84, title: 'Invoice scan quality below threshold', reference: 'Invoice · Page 11', fix: 'Replace blurry invoice scan with a clearer image or rescan at 300 DPI.' },
  { id: 'id', severity: 'Medium', confidence: 78, title: 'Insurance ID appears incomplete', reference: 'Claim Form · Page 3', fix: 'Confirm member ID and apply it to the generated packet.' },
];

const claimTimeline = [
  { id: 'uploaded', label: 'Claim Uploaded', time: '10:42 AM', done: true },
  { id: 'classified', label: 'Documents Classified', time: '10:43 AM', done: true },
  { id: 'ocr', label: 'OCR Completed', time: '10:43 AM', done: true },
  { id: 'validation', label: 'AI Validation Complete', time: '10:44 AM', done: true },
  { id: 'issues', label: 'Issues Detected', time: '10:44 AM', done: true },
  { id: 'repair', label: 'Repair Suggestions Generated', time: '10:45 AM', done: true },
  { id: 'ready', label: 'Submission Ready', time: 'Pending repairs', done: false },
];

const pdfStructure = [
  '01  Cover sheet and AI verification summary',
  '02  Insurance card and payer details',
  '03  Discharge summary with bookmarks',
  '04  Lab reports and clinical evidence',
  '05  Itemized invoice and totals',
  '06  Repair log and compliance notes',
];

const toneClasses: Record<string, string> = {
  success: 'bg-success-bg text-success-foreground border-success/20',
  warning: 'bg-warning-bg text-warning-foreground border-warning/20',
  danger: 'bg-danger-bg text-danger-foreground border-danger/20',
  info: 'bg-info-bg text-info-foreground border-info/20',
};

export default function AnalysisResults({ claimId, packet, claimFields, onUpdateField, onReset }: AnalysisResultsProps) {
  const [expandedDoc, setExpandedDoc] = useState<string>('insurance-card');
  const [timelineVisible, setTimelineVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimelineVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="badge-success"><CheckCircle2 size={11} /> AI Processing Complete</span>
            <span className="badge-muted font-tabular">{claimId}</span>
            <span className="badge-warning"><AlertTriangle size={11} /> 3 issues detected</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {packet.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {packet.pages} pages · {packet.size} · Uploaded {packet.uploadedAt}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onReset} className="btn-ghost gap-1.5">
            <RotateCcw size={14} /> New claim
          </button>
          <button className="btn-primary">
            <Download size={15} /> Export packet
          </button>
        </div>
      </div>

      {/* Validation metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {validationMetrics.map((m) => (
          <div key={m.id} className="card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{m.label}</p>
            <p className={`text-3xl font-bold font-tabular ${m.color}`}>
              {m.value}<span className="text-base font-medium text-muted-foreground ml-0.5">{m.unit}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">{m.helper}</p>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* Left col: Document Classification + Issues */}
        <div className="xl:col-span-7 space-y-6">

          {/* Document Classification */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">Smart Document Classification</h2>
                <p className="text-xs text-muted-foreground mt-0.5">AI grouped {packet.pages} pages automatically — no manual categorization needed</p>
              </div>
              <span className="badge-success">4 groups classified</span>
            </div>
            <div className="space-y-3">
              {documentGroups.map((group) => {
                const expanded = expandedDoc === group.id;
                return (
                  <div key={group.id} className="rounded-2xl border border-border overflow-hidden transition-all duration-300">
                    <button
                      type="button"
                      onClick={() => setExpandedDoc(expanded ? '' : group.id)}
                      className="w-full text-left p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <FileText size={18} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{group.title}</p>
                          <span className={`text-xs font-semibold rounded-full border px-2 py-0.5 ${toneClasses[group.tone]}`}>
                            {group.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{group.pages}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-sm font-bold font-tabular text-foreground">{group.confidence}%</p>
                          <p className="text-xs text-muted-foreground">confidence</p>
                        </div>
                        {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                      </div>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4 border-t border-border bg-muted/20 pt-4 fade-in">
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {[1, 2, 3, 4].map((p) => (
                            <div key={p} className="aspect-[3/4] rounded-xl border border-border bg-gradient-to-br from-white to-muted p-2 flex flex-col gap-1">
                              <div className="h-1.5 rounded bg-primary/20 w-3/4" />
                              <div className="h-1 rounded bg-muted-foreground/20" />
                              <div className="h-1 rounded bg-muted-foreground/20 w-4/5" />
                              <div className="h-1 rounded bg-muted-foreground/20 w-2/3" />
                              <div className="h-1 rounded bg-muted-foreground/10 mt-auto" />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground leading-5">{group.summary}</p>
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-info confidence-fill"
                            style={{ width: `${group.confidence}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Issue Detection */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">AI Issue Detection</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Copilot findings with evidence references and suggested fixes</p>
              </div>
              <AlertTriangle size={20} className="text-warning" />
            </div>
            <div className="space-y-3">
              {issues.map((issue) => (
                <div key={issue.id} className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${issue.severity === 'High' ? 'bg-danger-bg' : 'bg-warning-bg'}`}>
                      <ShieldAlert size={15} className={issue.severity === 'High' ? 'text-danger' : 'text-warning'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className={issue.severity === 'High' ? 'badge-danger' : 'badge-warning'}>{issue.severity}</span>
                        <span className="text-xs text-muted-foreground font-tabular">{issue.confidence}% confidence</span>
                        <span className="text-xs text-muted-foreground">· {issue.reference}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                      <div className="mt-2 rounded-xl bg-info-bg border border-info/15 p-3">
                        <p className="text-xs font-semibold text-info-foreground mb-0.5">Suggested fix</p>
                        <p className="text-xs text-muted-foreground leading-5">{issue.fix}</p>
                      </div>
                      <button className="btn-secondary mt-3 text-xs py-1.5 px-3 rounded-lg">
                        Start repair <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right col: Extracted Data + Timeline + PDF */}
        <div className="xl:col-span-5 space-y-6">

          {/* Auto-filled Claim Data */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">Auto-Filled Claim Data</h2>
                <p className="text-xs text-muted-foreground mt-0.5">AI extracted this information automatically</p>
              </div>
              <span className="badge-info"><Sparkles size={11} /> Editable</span>
            </div>
            <div className="space-y-3">
              {claimFields.map((field) => (
                <label key={field.id} className="block">
                  <span className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-muted-foreground">{field.label}</span>
                    <span className={`text-xs font-tabular font-semibold ${field.confidence >= 95 ? 'text-success-foreground' : field.confidence >= 88 ? 'text-warning-foreground' : 'text-danger-foreground'}`}>
                      {field.confidence}% AI
                    </span>
                  </span>
                  <input
                    className="input-field"
                    value={field.value}
                    onChange={(e) => onUpdateField(field.id, e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground mt-0.5 block">Source: {field.source}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Claim Timeline */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">Claim Timeline</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Operational audit trail</p>
              </div>
              <Clock3 size={18} className="text-primary" />
            </div>
            <div className="space-y-0">
              {claimTimeline.map((item, i) => (
                <div
                  key={item.id}
                  className={`flex gap-3 transition-all duration-500 ${timelineVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${item.done ? 'bg-success text-white' : 'bg-muted text-muted-foreground'}`}>
                      {item.done ? <CheckCircle2 size={14} /> : <Clock3 size={13} />}
                    </div>
                    {i < claimTimeline.length - 1 && (
                      <div className={`w-px flex-1 my-1 min-h-[24px] transition-colors ${item.done ? 'bg-success/30' : 'bg-border'}`} />
                    )}
                  </div>
                  <div className="pb-3 pt-0.5">
                    <p className={`text-sm font-semibold ${item.done ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</p>
                    <p className="text-xs text-muted-foreground font-tabular">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* PDF Generation */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">Master PDF Generation</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Indexed, AI-verified submission packet</p>
              </div>
              <ClipboardCheck size={18} className="text-primary" />
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">Export readiness</p>
                <span className="badge-warning">Repairs pending</span>
              </div>
              <div className="h-2.5 rounded-full bg-white overflow-hidden">
                <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-warning to-success transition-all duration-1000" />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 font-tabular">76% complete · 2 repairs remaining</p>
            </div>
            <div className="space-y-2 mb-4">
              {pdfStructure.map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <FileText size={12} className="text-primary shrink-0" />
                  <span className="font-tabular">{item}</span>
                </div>
              ))}
            </div>
            <button className="btn-primary w-full">
              <Download size={15} /> Generate submission-ready packet
            </button>
          </div>
        </div>
      </div>

      {/* Smart Repair Suggestions */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-header">Smart Repair Suggestions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">AI-generated actionable workflows to clear all blockers</p>
          </div>
          <Wand2 size={18} className="text-primary" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-2xl border border-border bg-gradient-to-br from-white to-muted/30 p-4">
              <span className={`${issue.severity === 'High' ? 'badge-danger' : 'badge-warning'} mb-3`}>{issue.severity} priority</span>
              <p className="text-sm font-semibold text-foreground mt-2">{issue.title}</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-5">{issue.fix}</p>
              <button className="btn-primary mt-4 w-full text-sm py-2">
                Start repair <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
