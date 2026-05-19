'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  ClaimAudit,
  ClaimField,
  ClaimFieldKey,
  Packet,
  ValidationIssue,
  ValidationReport,
} from './ClaimIntakeFlow';

interface AnalysisResultsProps {
  claimId: string;
  packet: Packet;
  claimFields: ClaimField[];
  validationReport: ValidationReport;
  claimAudit: ClaimAudit;
  onUpdateField: (id: ClaimFieldKey, value: string) => void;
  onReset: () => void;
}

const toneClasses: Record<string, string> = {
  success: 'bg-success-bg text-success-foreground border-success/20',
  warning: 'bg-warning-bg text-warning-foreground border-warning/20',
  danger: 'bg-danger-bg text-danger-foreground border-danger/20',
  info: 'bg-info-bg text-info-foreground border-info/20',
};

const isSevere = (issue: ValidationIssue) =>
  issue.severity === 'Critical' || issue.severity === 'High';

export default function AnalysisResults({
  claimId,
  packet,
  claimFields,
  validationReport,
  claimAudit,
  onUpdateField,
  onReset,
}: AnalysisResultsProps) {
  const [expandedDoc, setExpandedDoc] = useState<string>(
    validationReport.documentGroups[0]?.id || ''
  );
  const [timelineVisible, setTimelineVisible] = useState(false);

  const { documentGroups, metrics, issues, timeline, pdfStructure } = validationReport;
  const hasIssues = issues.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => setTimelineVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setExpandedDoc(validationReport.documentGroups[0]?.id || '');
  }, [validationReport.documentGroups]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="badge-success">
              <CheckCircle2 size={11} /> AI Processing Complete
            </span>
            <span className="badge-muted font-tabular">{claimId}</span>
            <span className={hasIssues ? 'badge-warning' : 'badge-success'}>
              {hasIssues ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
              {hasIssues ? `${issues.length} issues detected` : 'No blockers detected'}
            </span>
            <span className="badge-info">
              {validationReport.source === 'ai' ? 'AI validated' : 'Local pipeline'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{packet.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {packet.pages} pages - {packet.size} - Uploaded {packet.uploadedAt}
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-5">
            {validationReport.summary}
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div key={metric.id} className="card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {metric.label}
            </p>
            <p className={`text-3xl font-bold font-tabular ${metric.color}`}>
              {metric.value}
              <span className="text-base font-medium text-muted-foreground ml-0.5">
                {metric.unit}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">{metric.helper}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">Smart Document Classification</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Page grouping is inferred from the uploaded PDF content
                </p>
              </div>
              <span className="badge-success">{documentGroups.length} groups evaluated</span>
            </div>
            <div className="space-y-3">
              {documentGroups.length === 0 ? (
                <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No document groups were returned by validation.
                </div>
              ) : (
                documentGroups.map((group) => {
                  const expanded = expandedDoc === group.id;
                  return (
                    <div
                      key={group.id}
                      className="rounded-2xl border border-border overflow-hidden transition-all duration-300"
                    >
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
                            <span
                              className={`text-xs font-semibold rounded-full border px-2 py-0.5 ${
                                toneClasses[group.tone]
                              }`}
                            >
                              {group.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{group.pages}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold font-tabular text-foreground">
                              {group.confidence}%
                            </p>
                            <p className="text-xs text-muted-foreground">confidence</p>
                          </div>
                          {expanded ? (
                            <ChevronDown size={16} className="text-muted-foreground" />
                          ) : (
                            <ChevronRight size={16} className="text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {expanded && (
                        <div className="px-4 pb-4 border-t border-border bg-muted/20 pt-4 fade-in">
                          <p className="text-xs text-muted-foreground leading-5">{group.summary}</p>
                          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary to-info confidence-fill"
                              style={{ width: `${group.confidence}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">AI Issue Detection</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Findings are generated from this uploaded packet only
                </p>
              </div>
              <AlertTriangle size={20} className={hasIssues ? 'text-warning' : 'text-success'} />
            </div>
            <div className="space-y-3">
              {!hasIssues ? (
                <div className="rounded-2xl border border-success/20 bg-success-bg/30 p-4">
                  <p className="text-sm font-semibold text-success-foreground">
                    No claim blockers detected
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The validation engine did not find missing DOB, diagnosis, signatures, billing
                    mismatch, incomplete insurance ID, or low-quality scan indicators.
                  </p>
                </div>
              ) : (
                issues.map((issue) => (
                  <div key={issue.id} className="rounded-2xl border border-border bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isSevere(issue) ? 'bg-danger-bg' : 'bg-warning-bg'
                        }`}
                      >
                        <ShieldAlert
                          size={15}
                          className={isSevere(issue) ? 'text-danger' : 'text-warning'}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={isSevere(issue) ? 'badge-danger' : 'badge-warning'}>
                            {issue.severity}
                          </span>
                          <span className="text-xs text-muted-foreground font-tabular">
                            {issue.confidence}% confidence
                          </span>
                          <span className="text-xs text-muted-foreground">- {issue.reference}</span>
                        </div>
                        <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                        {issue.evidence && (
                          <p className="text-xs text-muted-foreground mt-1 leading-5">
                            {issue.evidence}
                          </p>
                        )}
                        <div className="mt-2 rounded-xl bg-info-bg border border-info/15 p-3">
                          <p className="text-xs font-semibold text-info-foreground mb-0.5">
                            Suggested fix
                          </p>
                          <p className="text-xs text-muted-foreground leading-5">{issue.fix}</p>
                        </div>
                        <button className="btn-secondary mt-3 text-xs py-1.5 px-3 rounded-lg">
                          Start repair <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-5 space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">Auto-Filled Claim Data</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Extracted dynamically from the uploaded PDF
                </p>
              </div>
              <span className="badge-info">
                <Sparkles size={11} /> Editable
              </span>
            </div>
            <div className="space-y-3">
              {claimFields.map((field) => {
                const hasValue = field.value.trim().length > 0;
                const confidence = hasValue ? field.confidence : 0;
                const sourceText = hasValue
                  ? field.sourcePage
                    ? `${field.sourceDocType || field.source} · page ${field.sourcePage}${
                        field.method ? ` · ${field.method}` : ''
                      }`
                    : field.source
                  : 'No source page extracted';

                return (
                  <label key={field.id} className="block">
                    <span className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {field.label}
                      </span>
                      <span
                        className={`text-xs font-tabular font-semibold ${
                          confidence >= 95
                            ? 'text-success-foreground'
                            : confidence >= 75
                              ? 'text-warning-foreground'
                              : 'text-danger-foreground'
                        }`}
                      >
                        {confidence}% AI
                      </span>
                    </span>
                    <input
                      className="input-field"
                      value={field.value}
                      placeholder="No value extracted"
                      onChange={(event) => onUpdateField(field.id, event.target.value)}
                    />
                    <span className="text-xs text-muted-foreground mt-0.5 block">
                      Source: {sourceText}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">Claim Timeline</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Operational audit trail</p>
              </div>
              <Clock3 size={18} className="text-primary" />
            </div>
            <div className="space-y-0">
              {timeline.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex gap-3 transition-all duration-500 ${
                    timelineVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                  style={{ transitionDelay: `${index * 80}ms` }}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        item.done ? 'bg-success text-white' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {item.done ? <CheckCircle2 size={14} /> : <Clock3 size={13} />}
                    </div>
                    {index < timeline.length - 1 && (
                      <div
                        className={`w-px flex-1 my-1 min-h-[24px] transition-colors ${
                          item.done ? 'bg-success/30' : 'bg-border'
                        }`}
                      />
                    )}
                  </div>
                  <div className="pb-3 pt-0.5">
                    <p
                      className={`text-sm font-semibold ${
                        item.done ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground font-tabular">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-header">Master PDF Generation</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Indexed, AI-verified submission packet
                </p>
              </div>
              <ClipboardCheck size={18} className="text-primary" />
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">Export readiness</p>
                <span className={hasIssues ? 'badge-warning' : 'badge-success'}>
                  {hasIssues ? 'Repairs pending' : 'Ready for review'}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-warning to-success transition-all duration-1000"
                  style={{ width: `${validationReport.readinessScore}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 font-tabular">
                {validationReport.readinessScore}% complete - {issues.length} repairs remaining
              </p>
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

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-header">Smart Repair Suggestions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contextual workflows generated from detected blockers
            </p>
          </div>
          <Wand2 size={18} className="text-primary" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {!hasIssues ? (
            <div className="rounded-2xl border border-success/20 bg-success-bg/30 p-4">
              <p className="text-sm font-semibold text-success-foreground">
                No repair workflow required
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-5">
                Keep a human reviewer in the loop for final payer submission, but this packet has no
                detected validation blockers.
              </p>
            </div>
          ) : (
            issues.map((issue) => (
              <div
                key={issue.id}
                className="rounded-2xl border border-border bg-gradient-to-br from-white to-muted/30 p-4"
              >
                <span className={`${isSevere(issue) ? 'badge-danger' : 'badge-warning'} mb-3`}>
                  {issue.severity} priority
                </span>
                <p className="text-sm font-semibold text-foreground mt-2">{issue.title}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-5">{issue.fix}</p>
                <button className="btn-primary mt-4 w-full text-sm py-2">
                  Start repair <ArrowRight size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="section-header">Medical Claim Audit JSON</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Strict extraction schema with actionable validation errors
            </p>
          </div>
          <span className={claimAudit.validation_errors.length ? 'badge-warning' : 'badge-success'}>
            {claimAudit.validation_errors.length
              ? `${claimAudit.validation_errors.length} validation errors`
              : 'No audit errors'}
          </span>
        </div>
        <pre className="max-h-[520px] overflow-auto rounded-xl border border-border bg-muted/50 p-4 text-xs leading-5 text-foreground">
          {JSON.stringify(claimAudit, null, 2)}
        </pre>
      </div>
    </div>
  );
}
