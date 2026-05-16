'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Clock,
  Eye,
  FileSearch,
  FileWarning,
  PenLine,
  ScanLine,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface AIScanningStepProps {
  uploadedDocs: Record<string, { name: string; size: string; status: string }>;
  onComplete: () => void;
  onBack: () => void;
}

const scanPhases = [
  { id: 'phase-ocr', label: 'OCR Text Extraction', icon: ScanLine, duration: 2000 },
  { id: 'phase-sig', label: 'Signature Detection', icon: PenLine, duration: 1500 },
  { id: 'phase-blur', label: 'Blur & Quality Analysis', icon: Eye, duration: 1200 },
  { id: 'phase-compliance', label: 'Compliance Checking', icon: ShieldCheck, duration: 1800 },
  { id: 'phase-codes', label: 'Medical Code Validation', icon: FileSearch, duration: 1400 },
  { id: 'phase-risk', label: 'Risk Scoring', icon: BarChart2, duration: 1000 },
];

export default function AIScanningStep({ uploadedDocs, onComplete, onBack }: AIScanningStepProps) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [completedPhases, setCompletedPhases] = useState<Set<number>>(new Set());
  const [scanComplete, setScanComplete] = useState(false);
  const docEntries = Object.entries(uploadedDocs);
  const validationIssues = useMemo(
    () =>
      docEntries
        .filter(([, doc]) => doc.status === 'warning' || doc.status === 'failed')
        .map(([docId, doc]) => ({
          id: `issue-${docId}`,
          severity: doc.status === 'failed' ? ('critical' as const) : ('warning' as const),
          title:
            doc.status === 'failed' ? 'Document processing failed' : 'Document quality needs review',
          description:
            doc.status === 'failed'
              ? `${doc.name} could not be processed by the extraction pipeline.`
              : `${doc.name} was accepted with quality warnings that can reduce OCR confidence.`,
          document: doc.name,
          repairAction:
            doc.status === 'failed'
              ? 'Upload a supported, readable PDF or image file.'
              : 'Upload a clearer source file if key fields are missing after extraction.',
          confidence: doc.status === 'failed' ? 96 : 78,
        })),
    [docEntries]
  );
  const overallConfidence =
    docEntries.length === 0 ? 0 : Math.max(35, 95 - validationIssues.length * 14);

  useEffect(() => {
    let phaseIndex = 0;

    const runPhase = () => {
      if (phaseIndex >= scanPhases.length) {
        setScanComplete(true);
        return;
      }
      setCurrentPhase(phaseIndex);
      setTimeout(() => {
        setCompletedPhases((prev) => new Set([...prev, phaseIndex]));
        phaseIndex++;
        runPhase();
      }, scanPhases[phaseIndex]?.duration || 1500);
    };

    const timer = setTimeout(runPhase, 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                scanComplete ? 'bg-success-bg' : 'bg-primary/10'
              }`}
            >
              {scanComplete ? (
                <CheckCircle2 size={20} className="text-success" />
              ) : (
                <Zap size={20} className="text-primary validation-pulse" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                {scanComplete ? 'AI Scan Complete' : 'AI Scanning in Progress'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {scanComplete
                  ? `${docEntries.length} documents processed`
                  : `Processing ${scanPhases[currentPhase]?.label.toLowerCase()}...`}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {scanPhases.map((phase, idx) => {
              const isCompleted = completedPhases.has(idx);
              const isActive = currentPhase === idx && !isCompleted;

              return (
                <div
                  key={phase.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl transition-all duration-300 ${
                    isActive
                      ? 'bg-primary/5 border border-primary/10'
                      : isCompleted
                        ? 'opacity-70'
                        : 'opacity-40'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isCompleted ? 'bg-success-bg' : isActive ? 'bg-primary/10' : 'bg-muted'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={14} className="text-success" />
                    ) : isActive ? (
                      <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      <phase.icon size={14} className="text-muted-foreground" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isCompleted
                        ? 'text-success-foreground'
                        : isActive
                          ? 'text-primary'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {phase.label}
                  </span>
                  {isActive && (
                    <span className="ml-auto text-xs text-primary font-medium validation-pulse">
                      Running...
                    </span>
                  )}
                  {isCompleted && (
                    <span className="ml-auto text-xs text-success font-medium">Done</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">Document Status</h3>
          <div className="space-y-2">
            {docEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents uploaded</p>
            ) : (
              docEntries.map(([docId, doc]) => (
                <div key={`dstat-${docId}`} className="flex items-center gap-2.5 py-1.5">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      doc.status === 'passed'
                        ? 'bg-success'
                        : doc.status === 'warning'
                          ? 'bg-warning'
                          : doc.status === 'failed'
                            ? 'bg-danger'
                            : 'bg-muted-foreground'
                    }`}
                  />
                  <span className="text-xs text-foreground truncate flex-1">{doc.name}</span>
                  <span
                    className={`text-xs font-medium ${
                      doc.status === 'passed'
                        ? 'text-success-foreground'
                        : doc.status === 'warning'
                          ? 'text-warning-foreground'
                          : doc.status === 'failed'
                            ? 'text-danger-foreground'
                            : 'text-muted-foreground'
                    }`}
                  >
                    {doc.status === 'passed'
                      ? 'OCR OK'
                      : doc.status === 'warning'
                        ? 'Review'
                        : doc.status === 'failed'
                          ? 'Failed'
                          : 'Processing'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground text-sm">Overall AI Confidence</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Composite validation score across uploaded documents
              </p>
            </div>
            <span
              className={`text-3xl font-bold font-tabular ${
                overallConfidence >= 85
                  ? 'text-success-foreground'
                  : overallConfidence >= 65
                    ? 'text-warning-foreground'
                    : 'text-danger-foreground'
              }`}
            >
              {overallConfidence}%
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full confidence-fill ${
                overallConfidence >= 85
                  ? 'bg-success'
                  : overallConfidence >= 65
                    ? 'bg-warning'
                    : 'bg-danger'
              }`}
              style={{ width: `${scanComplete ? overallConfidence : 0}%` }}
            />
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground text-sm">AI Repair Suggestions</h3>
            <span className={validationIssues.length ? 'badge-warning' : 'badge-success'}>
              {validationIssues.length ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
              {validationIssues.length
                ? `${validationIssues.length} issues found`
                : 'No issues found'}
            </span>
          </div>

          <div className="space-y-3">
            {validationIssues.length === 0 ? (
              <div className="rounded-xl border border-success/20 bg-success-bg/30 p-4">
                <p className="text-sm font-semibold text-success-foreground">
                  No upload quality blockers detected
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Continue to extraction to run claim-content validation.
                </p>
              </div>
            ) : (
              validationIssues.map((issue) => (
                <div
                  key={issue.id}
                  className={`rounded-xl border p-4 ${
                    issue.severity === 'critical'
                      ? 'border-danger/20 bg-danger-bg/40'
                      : 'border-warning/20 bg-warning-bg/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        issue.severity === 'critical' ? 'bg-danger-bg' : 'bg-warning-bg'
                      }`}
                    >
                      {issue.severity === 'critical' ? (
                        <AlertTriangle size={13} className="text-danger" />
                      ) : (
                        <FileWarning size={13} className="text-warning" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                        <span className="text-xs font-semibold font-tabular shrink-0">
                          {issue.confidence}% conf.
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {issue.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="badge-muted">{issue.document}</span>
                      </div>
                      <div className="mt-3 p-2.5 rounded-lg bg-white/70 border border-border">
                        <p className="text-xs font-semibold text-foreground mb-0.5 flex items-center gap-1.5">
                          <Zap size={11} className="text-primary" /> AI Repair Suggestion
                        </p>
                        <p className="text-xs text-muted-foreground leading-snug">
                          {issue.repairAction}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {scanComplete && (
          <div className="card p-5 border-warning/20 bg-warning-bg/20 fade-in">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-warning-bg flex items-center justify-center shrink-0">
                <Clock size={16} className="text-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Submission Readiness: {overallConfidence}/100
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  This score reflects upload quality only. Final claim validation is generated from
                  extracted document content in the next review step.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-5 flex items-center justify-between pt-2">
        <button type="button" onClick={onBack} className="btn-secondary gap-2">
          <ArrowLeft size={15} /> Back to Documents
        </button>
        <div className="flex items-center gap-3">
          {!scanComplete && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              AI processing in progress...
            </span>
          )}
          <button
            type="button"
            onClick={onComplete}
            disabled={!scanComplete}
            className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Review & Confirm <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
