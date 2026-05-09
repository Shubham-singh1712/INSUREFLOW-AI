'use client';
import React, { useState, useEffect } from 'react';
import { ShieldCheck, ScanLine, AlertTriangle, CheckCircle2, ArrowLeft, ArrowRight, User, RefreshCcw } from 'lucide-react';
import type { UploadedDoc } from './ClaimIntakeFlow';

interface GatekeeperStepProps {
  uploadedDocs: Record<string, UploadedDoc>;
  onPass: () => void;
  onBack: () => void;
}

type GatekeeperStatus = 'scanning' | 'passed' | 'failed';

const checkItems = [
  { id: 'ocr-pass', label: 'Running lightweight OCR pass', duration: 1200 },
  { id: 'patient-name', label: 'Detecting Patient Name field', duration: 1000 },
  { id: 'doc-type', label: 'Classifying document types', duration: 800 },
  { id: 'readability', label: 'Checking document readability', duration: 700 },
];

export default function GatekeeperStep({ uploadedDocs, onPass, onBack }: GatekeeperStepProps) {
  const [status, setStatus] = useState<GatekeeperStatus>('scanning');
  const [completedChecks, setCompletedChecks] = useState<Set<number>>(new Set());
  const [currentCheck, setCurrentCheck] = useState(0);
  const [detectedName, setDetectedName] = useState('Ramesh Kumar Iyer');
  const [confidence, setConfidence] = useState(96);

  useEffect(() => {
    let idx = 0;
    const runCheck = () => {
      if (idx >= checkItems.length) {
        fetch('/api/claims/gatekeeper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents: uploadedDocs }),
        })
          .then(async (response) => ({ response, payload: await response.json() }))
          .then(({ response, payload }) => {
            if (response.ok && payload.ok && payload.data.passed) {
              setDetectedName(payload.data.detectedName);
              setConfidence(payload.data.confidence);
              setStatus('passed');
              return;
            }
            setStatus('failed');
          })
          .catch(() => setStatus('failed'));
        return;
      }
      setCurrentCheck(idx);
      setTimeout(() => {
        setCompletedChecks(prev => new Set([...prev, idx]));
        idx++;
        runCheck();
      }, checkItems[idx]?.duration || 900);
    };
    const timer = setTimeout(runCheck, 300);
    return () => clearTimeout(timer);
  }, [uploadedDocs]);

  const docCount = Object.keys(uploadedDocs).length || 3;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header card */}
      <div className={`card p-6 transition-all duration-500 ${
        status === 'passed' ? 'border-success/30' :
        status === 'failed' ? 'border-danger/30' : ''
      }`}>
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
            status === 'scanning' ? 'bg-primary/10' :
            status === 'passed' ? 'bg-success-bg' : 'bg-danger-bg'
          }`}>
            {status === 'scanning' && <ScanLine size={24} className="text-primary validation-pulse" />}
            {status === 'passed' && <ShieldCheck size={24} className="text-success" />}
            {status === 'failed' && <AlertTriangle size={24} className="text-danger" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {status === 'scanning' && 'Gatekeeper Check Running'}
              {status === 'passed' && 'Gatekeeper Check Passed'}
              {status === 'failed' && 'Processing Failed'}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {status === 'scanning' && `Scanning ${docCount} uploaded document${docCount !== 1 ? 's' : ''} for patient identity...`}
              {status === 'passed' && 'Patient name detected — proceeding to full AI extraction'}
              {status === 'failed' && 'No valid Patient Name detected in uploaded documents'}
            </p>
          </div>
        </div>

        {/* Check items */}
        <div className="space-y-3">
          {checkItems.map((check, idx) => {
            const isCompleted = completedChecks.has(idx);
            const isActive = currentCheck === idx && status === 'scanning';
            const isPending = idx > currentCheck && status === 'scanning';

            return (
              <div
                key={check.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${
                  isActive ? 'bg-primary/5 border border-primary/10' :
                  isCompleted ? 'bg-muted/30' : 'opacity-40'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isCompleted ? 'bg-success-bg' : isActive ? 'bg-primary/10' : 'bg-muted'
                }`}>
                  {isCompleted
                    ? <CheckCircle2 size={14} className="text-success" />
                    : isActive
                    ? <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    : <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                  }
                </div>
                <span className={`text-sm font-medium ${
                  isCompleted ? 'text-foreground' :
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}>{check.label}</span>
                {isActive && (
                  <span className="ml-auto text-xs text-primary font-medium validation-pulse">Running...</span>
                )}
                {isCompleted && (
                  <span className="ml-auto text-xs text-success font-medium">✓ Done</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Result card — shown after scan */}
      {status === 'passed' && (
        <div className="card p-5 border-success/20 bg-success-bg/20 fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-success-bg flex items-center justify-center shrink-0">
              <User size={16} className="text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground mb-1">Patient Name Detected</p>
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-foreground font-tabular">{detectedName}</span>
                <span className="badge-success text-xs">
                  <CheckCircle2 size={10} /> {confidence}% confidence
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Extracted from Intake Form · Proceeding to full AI extraction and data mapping
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="card p-5 border-danger/20 bg-danger-bg/20 fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-danger-bg flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-danger" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground mb-1">Processing Failed</p>
              <p className="text-sm text-danger-foreground">
                No valid Patient Name detected in the uploaded documents. Please ensure the Intake Form or Insurance Card is clearly legible and re-upload.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="card p-5 flex items-center justify-between">
        <button onClick={onBack} className="btn-secondary gap-2">
          <ArrowLeft size={15} /> Back to Upload
        </button>
        {status === 'failed' ? (
          <button onClick={onBack} className="btn-primary gap-2">
            <RefreshCcw size={15} /> Re-upload Documents
          </button>
        ) : (
          <button
            onClick={onPass}
            disabled={status !== 'passed'}
            className="btn-primary px-6 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Proceed to AI Extraction <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
