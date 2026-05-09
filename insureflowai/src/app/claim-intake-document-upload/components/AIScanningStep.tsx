'use client';
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, ScanLine, FileSearch, PenLine, Eye,
  AlertTriangle, CheckCircle2, Clock, Zap, ArrowLeft,
  ArrowRight, BarChart2, FileWarning,
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

const validationIssues = [
  {
    id: 'issue-001',
    severity: 'critical' as const,
    title: 'Doctor signature missing',
    description: 'Attending physician signature not detected on discharge summary (Page 3)',
    document: 'Discharge Summary',
    repairAction: 'Request re-signed copy from Dr. Suresh Babu',
    confidence: 94,
  },
  {
    id: 'issue-002',
    severity: 'warning' as const,
    title: 'Lab report image quality low',
    description: 'Blur score 0.31 — below minimum threshold of 0.45 for OCR accuracy',
    document: 'Lab Reports',
    repairAction: 'Re-scan lab report at higher resolution (min 300 DPI)',
    confidence: 87,
  },
  {
    id: 'issue-003',
    severity: 'info' as const,
    title: 'Procedure code not in pre-auth scope',
    description: 'CPT 93510 not listed in pre-authorization PA-2026-00847',
    document: 'Invoice',
    repairAction: 'Attach supplementary pre-auth or update claim type to Reimbursement',
    confidence: 78,
  },
];

export default function AIScanningStep({ uploadedDocs, onComplete, onBack }: AIScanningStepProps) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [completedPhases, setCompletedPhases] = useState<Set<number>>(new Set());
  const [scanComplete, setScanComplete] = useState(false);
  const [overallConfidence] = useState(81);

  useEffect(() => {
    let phaseIndex = 0;

    const runPhase = () => {
      if (phaseIndex >= scanPhases.length) {
        setScanComplete(true);
        return;
      }
      setCurrentPhase(phaseIndex);
      setTimeout(() => {
        setCompletedPhases(prev => new Set([...prev, phaseIndex]));
        phaseIndex++;
        runPhase();
      }, scanPhases[phaseIndex]?.duration || 1500);
    };

    const timer = setTimeout(runPhase, 400);
    return () => clearTimeout(timer);
  }, []);

  const docEntries = Object.entries(uploadedDocs);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left: Scan progress */}
      <div className="lg:col-span-2 space-y-4">
        {/* AI Engine card */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              scanComplete ? 'bg-success-bg' : 'bg-primary/10'
            }`}>
              {scanComplete
                ? <CheckCircle2 size={20} className="text-success" />
                : <Zap size={20} className="text-primary validation-pulse" />
              }
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                {scanComplete ? 'AI Scan Complete' : 'AI Scanning in Progress'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {scanComplete
                  ? `${docEntries.length} documents processed`
                  : `Processing ${scanPhases[currentPhase]?.label.toLowerCase()}...`
                }
              </p>
            </div>
          </div>

          {/* Phase checklist */}
          <div className="space-y-2.5">
            {scanPhases.map((phase, idx) => {
              const isCompleted = completedPhases.has(idx);
              const isActive = currentPhase === idx && !isCompleted;
              const isPending = idx > currentPhase;

              return (
                <div
                  key={phase.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl transition-all duration-300 ${
                    isActive ? 'bg-primary/5 border border-primary/10' :
                    isCompleted ? 'opacity-70' : 'opacity-40'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isCompleted ? 'bg-success-bg' : isActive ?'bg-primary/10' : 'bg-muted'
                  }`}>
                    {isCompleted
                      ? <CheckCircle2 size={14} className="text-success" />
                      : isActive
                      ? <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      : <phase.icon size={14} className="text-muted-foreground" />
                    }
                  </div>
                  <span className={`text-xs font-medium ${
                    isCompleted ? 'text-success-foreground' :
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}>{phase.label}</span>
                  {isActive && (
                    <span className="ml-auto text-xs text-primary font-medium validation-pulse">Running...</span>
                  )}
                  {isCompleted && (
                    <span className="ml-auto text-xs text-success font-medium">Done</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Document status */}
        <div className="card p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">Document Status</h3>
          <div className="space-y-2">
            {docEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No documents uploaded</p>
            ) : (
              docEntries.map(([docId, doc]) => (
                <div key={`dstat-${docId}`} className="flex items-center gap-2.5 py-1.5">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    doc.status === 'passed' ? 'bg-success' :
                    doc.status === 'warning' ? 'bg-warning' :
                    doc.status === 'failed' ? 'bg-danger' : 'bg-muted-foreground'
                  }`} />
                  <span className="text-xs text-foreground truncate flex-1">{doc.name}</span>
                  <span className={`text-xs font-medium ${
                    doc.status === 'passed' ? 'text-success-foreground' :
                    doc.status === 'warning' ? 'text-warning-foreground' :
                    doc.status === 'failed' ? 'text-danger-foreground' : 'text-muted-foreground'
                  }`}>
                    {doc.status === 'passed' ? 'OCR OK' :
                     doc.status === 'warning' ? 'Low Quality' :
                     doc.status === 'failed' ? 'Failed' : 'Processing'}
                  </span>
                </div>
              ))
            )}
            {docEntries.length === 0 && (
              <>
                {['Discharge Summary', 'Insurance Card', 'Lab Reports'].map((name) => (
                  <div key={`demo-${name}`} className="flex items-center gap-2.5 py-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0 bg-success" />
                    <span className="text-xs text-foreground truncate flex-1">{name}.pdf</span>
                    <span className="text-xs font-medium text-success-foreground">OCR OK</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Validation results */}
      <div className="lg:col-span-3 space-y-4">
        {/* Confidence score */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground text-sm">Overall AI Confidence</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Composite validation score across all documents</p>
            </div>
            <span className={`text-3xl font-bold font-tabular ${
              overallConfidence >= 85 ? 'text-success-foreground' :
              overallConfidence >= 65 ? 'text-warning-foreground' : 'text-danger-foreground'
            }`}>{overallConfidence}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full confidence-fill ${
                overallConfidence >= 85 ? 'bg-success' :
                overallConfidence >= 65 ? 'bg-warning' : 'bg-danger'
              }`}
              style={{ width: `${scanComplete ? overallConfidence : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">0%</span>
            <span className="text-xs text-muted-foreground font-medium">
              {overallConfidence >= 85 ? 'High confidence — minor fixes needed' :
               overallConfidence >= 65 ? 'Moderate confidence — repairs recommended': 'Low confidence — significant repairs required'}
            </span>
            <span className="text-xs text-muted-foreground">100%</span>
          </div>
        </div>

        {/* Validation issues */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground text-sm">AI Repair Suggestions</h3>
            <span className="badge-warning">
              <AlertTriangle size={10} /> {validationIssues.length} issues found
            </span>
          </div>

          <div className="space-y-3">
            {validationIssues.map((issue) => (
              <div
                key={issue.id}
                className={`rounded-xl border p-4 ${
                  issue.severity === 'critical' ? 'border-danger/20 bg-danger-bg/40' :
                  issue.severity === 'warning'? 'border-warning/20 bg-warning-bg/40' : 'border-border bg-muted/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    issue.severity === 'critical' ? 'bg-danger-bg' :
                    issue.severity === 'warning' ? 'bg-warning-bg' : 'bg-info-bg'
                  }`}>
                    {issue.severity === 'critical'
                      ? <AlertTriangle size={13} className="text-danger" />
                      : issue.severity === 'warning'
                      ? <FileWarning size={13} className="text-warning" />
                      : <Clock size={13} className="text-info" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                      <span className={`text-xs font-semibold font-tabular shrink-0 ${
                        issue.severity === 'critical' ? 'text-danger-foreground' :
                        issue.severity === 'warning' ? 'text-warning-foreground' : 'text-info-foreground'
                      }`}>{issue.confidence}% conf.</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{issue.description}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="badge-muted">{issue.document}</span>
                    </div>
                    <div className="mt-3 p-2.5 rounded-lg bg-white/70 border border-border">
                      <p className="text-xs font-semibold text-foreground mb-0.5 flex items-center gap-1.5">
                        <Zap size={11} className="text-primary" /> AI Repair Suggestion
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">{issue.repairAction}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button className="px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                        Apply Repair
                      </button>
                      <button className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted rounded-lg transition-colors">
                        Mark Resolved
                      </button>
                      <button className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted rounded-lg transition-colors">
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submission readiness */}
        {scanComplete && (
          <div className="card p-5 border-warning/20 bg-warning-bg/20 fade-in">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-warning-bg flex items-center justify-center shrink-0">
                <AlertTriangle size={16} className="text-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Submission Readiness: 62/100</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  This claim has 3 open issues that may cause TPA rejection. Apply the AI repair suggestions above before submitting, or proceed and accept the risk.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
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