'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Database,
  Eye,
  FileSearch,
  PenLine,
  ScanLine,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { ExtractedClaimData, UploadedDoc } from './ClaimIntakeFlow';

interface AIExtractionStepProps {
  uploadedDocs: Record<string, UploadedDoc>;
  onComplete: (data: ExtractedClaimData) => void;
  onBack: () => void;
}

const extractionPhases = [
  { id: 'phase-ocr', label: 'Deep OCR Text Extraction', icon: ScanLine, target: 'All documents' },
  {
    id: 'phase-nlp',
    label: 'Entity Recognition',
    icon: FileSearch,
    target: 'Patient and payer fields',
  },
  {
    id: 'phase-codes',
    label: 'Medical Code Extraction',
    icon: PenLine,
    target: 'ICD-10 and CPT codes',
  },
  {
    id: 'phase-billing',
    label: 'Billing Line Item Parsing',
    icon: Eye,
    target: 'Itemized bill charges',
  },
  {
    id: 'phase-clinical',
    label: 'Clinical Data Mapping',
    icon: ShieldCheck,
    target: 'Discharge summary',
  },
  {
    id: 'phase-confidence',
    label: 'Confidence Scoring',
    icon: BarChart2,
    target: 'All extracted fields',
  },
];

export default function AIExtractionStep({
  uploadedDocs,
  onComplete,
  onBack,
}: AIExtractionStepProps) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [completedPhases, setCompletedPhases] = useState<Set<number>>(new Set());
  const [extractionDone, setExtractionDone] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedClaimData | null>(null);
  const [extractionError, setExtractionError] = useState('');

  useEffect(() => {
    let active = true;
    let idx = 0;

    const runPhase = () => {
      if (!active) return;
      if (idx >= extractionPhases.length) {
        fetch('/api/claims/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents: uploadedDocs }),
        })
          .then(async (response) => ({ response, payload: await response.json() }))
          .then(({ response, payload }) => {
            if (!active) return;
            if (response.ok && payload.ok) {
              setExtractedData(payload.data.extractedData);
            } else {
              setExtractionError(payload.error || 'Live extraction failed.');
            }
            setExtractionDone(true);
          })
          .catch((error) => {
            if (!active) return;
            setExtractionError(error instanceof Error ? error.message : 'Live extraction failed.');
            setExtractionDone(true);
          });
        return;
      }

      setCurrentPhase(idx);
      setTimeout(() => {
        setCompletedPhases((prev) => new Set([...prev, idx]));
        idx++;
        runPhase();
      }, 900);
    };

    const timer = setTimeout(runPhase, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [uploadedDocs]);

  const docCount = Object.keys(uploadedDocs).length;
  const hasExtractionError = extractionDone && !extractedData;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${
                hasExtractionError
                  ? 'bg-danger-bg'
                  : extractionDone
                    ? 'bg-success-bg'
                    : 'bg-primary/10'
              }`}
            >
              {hasExtractionError ? (
                <AlertTriangle size={20} className="text-danger" />
              ) : extractionDone ? (
                <CheckCircle2 size={20} className="text-success" />
              ) : (
                <Zap size={20} className="text-primary validation-pulse" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                {hasExtractionError
                  ? 'Live Extraction Needs Attention'
                  : extractionDone
                    ? 'AI Extraction Complete'
                    : 'Deep AI Extraction Running'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {hasExtractionError
                  ? 'The provider could not parse one or more documents'
                  : extractionDone
                    ? `${docCount} documents mapped to claim schema`
                    : `${extractionPhases[currentPhase]?.label}...`}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {extractionPhases.map((phase, idx) => {
              const isCompleted = completedPhases.has(idx);
              const isActive = currentPhase === idx && !extractionDone;

              return (
                <div
                  key={phase.id}
                  className={`flex items-start gap-3 p-2.5 rounded-xl transition-all duration-300 ${
                    isActive
                      ? 'bg-primary/5 border border-primary/10'
                      : isCompleted
                        ? 'opacity-80'
                        : 'opacity-35'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isCompleted ? 'bg-success-bg' : isActive ? 'bg-primary/10' : 'bg-muted'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={13} className="text-success" />
                    ) : isActive ? (
                      <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      <phase.icon size={13} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium ${
                        isCompleted
                          ? 'text-foreground'
                          : isActive
                            ? 'text-primary'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {phase.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{phase.target}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {extractionDone && extractedData && (
          <div className="card p-5 fade-in">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">Overall Confidence</p>
              <span className="text-2xl font-bold text-success-foreground font-tabular">
                {extractedData.extraction_meta.overall_confidence}%
              </span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-success rounded-full transition-all duration-700"
                style={{ width: `${extractedData.extraction_meta.overall_confidence}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {extractedData.extraction_meta.low_confidence_fields.length} fields flagged for manual
              review
            </p>
          </div>
        )}
      </div>

      <div className="lg:col-span-3 space-y-4">
        {!extractionDone ? (
          <div className="card p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Database size={28} className="text-primary validation-pulse" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Mapping to Claim Schema</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              AI is extracting and mapping document fields to the standardized claim schema.
            </p>
          </div>
        ) : extractedData ? (
          <div className="card p-5 fade-in">
            <h4 className="text-sm font-semibold text-foreground mb-4">Extracted Claim Summary</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['Patient', extractedData.patient.full_name],
                ['DOB', extractedData.patient.date_of_birth],
                ['Member ID', extractedData.insurance.member_id],
                ['Payer ID', extractedData.insurance.payer_id],
                ['Diagnosis', extractedData.clinical.principal_diagnosis],
                ['Physician', extractedData.clinical.attending_physician],
                ['Facility', extractedData.clinical.facility_name],
                ['Total billed', extractedData.billing.total_billed_amount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                  <p className="text-sm text-foreground mt-1">{value || 'Not found'}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card p-8 flex flex-col items-center justify-center text-center min-h-[300px] border-danger/20 bg-danger-bg/20">
            <AlertTriangle size={28} className="text-danger mb-3" />
            <h3 className="font-semibold text-foreground mb-2">Live Extraction Needs Attention</h3>
            <p className="text-sm text-danger-foreground max-w-md">
              {extractionError ||
                'No extraction data was returned. Upload a readable PDF or configure an AI provider.'}
            </p>
          </div>
        )}
      </div>

      <div className="lg:col-span-5 card p-5 flex items-center justify-between">
        <button onClick={onBack} className="btn-secondary gap-2">
          <ArrowLeft size={15} /> Back
        </button>
        <button
          onClick={() => extractedData && onComplete(extractedData)}
          disabled={!extractionDone || !extractedData}
          className="btn-primary px-6 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review Extracted Data <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
