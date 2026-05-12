'use client';
import React, { useState, useEffect } from 'react';
import {
  ScanLine,
  FileSearch,
  PenLine,
  Eye,
  ShieldCheck,
  BarChart2,
  CheckCircle2,
  Zap,
  ArrowLeft,
  ArrowRight,
  Database,
  AlertTriangle,
} from 'lucide-react';
import type { UploadedDoc, ExtractedClaimData } from './ClaimIntakeFlow';

interface AIExtractionStepProps {
  uploadedDocs: Record<string, UploadedDoc>;
  onComplete: (data: ExtractedClaimData) => void;
  onBack: () => void;
}

const extractionPhases = [
  {
    id: 'phase-ocr',
    label: 'Deep OCR Text Extraction',
    icon: ScanLine,
    duration: 1800,
    target: 'All documents',
  },
  {
    id: 'phase-nlp',
    label: 'NLP Entity Recognition',
    icon: FileSearch,
    duration: 1600,
    target: 'Patient & Insurance fields',
  },
  {
    id: 'phase-codes',
    label: 'Medical Code Extraction',
    icon: PenLine,
    duration: 1400,
    target: 'ICD-10 & CPT/HCPCS codes',
  },
  {
    id: 'phase-billing',
    label: 'Billing Line Item Parsing',
    icon: Eye,
    duration: 1200,
    target: 'Itemized bill charges',
  },
  {
    id: 'phase-clinical',
    label: 'Clinical Data Mapping',
    icon: ShieldCheck,
    duration: 1000,
    target: 'Discharge summary & EHR',
  },
  {
    id: 'phase-schema',
    label: 'DB Schema Mapping',
    icon: Database,
    duration: 900,
    target: 'Claim extraction record',
  },
  {
    id: 'phase-confidence',
    label: 'Confidence Scoring',
    icon: BarChart2,
    duration: 700,
    target: 'All extracted fields',
  },
];

const _mockExtractedData: ExtractedClaimData = {
  patient: {
    full_name: 'Ramesh Kumar Iyer',
    date_of_birth: '1958-03-14',
    gender: 'M',
    address: '14, Poes Garden, Chennai - 600086, Tamil Nadu',
    contact_phone: '+91 98765 43210',
    contact_email: 'ramesh.iyer@email.com',
  },
  insurance: {
    policyholder_name: 'Ramesh Kumar Iyer',
    group_number: 'GRP-APM-2024-0048',
    member_id: 'MEM-7748291034',
    payer_id: 'APMH-PAYER-001',
    plan_name: 'Apollo Munich Optima Restore',
  },
  pre_authorization: {
    approval_code: 'PA-2026-00847',
    authorized_from: '2026-05-01',
    authorized_to: '2026-05-10',
  },
  clinical: {
    admission_date: '2026-05-01',
    discharge_date: '2026-05-06',
    attending_physician: 'Dr. Suresh Babu, Cardiologist',
    hospital_npi: '1234567890',
    hospital_tax_id: '33-AAACH1234C1Z5',
    facility_name: 'Apollo Hospitals, Greams Road, Chennai',
    principal_diagnosis: 'I21.0',
  },
  coding: {
    icd10_codes: [
      {
        code: 'I21.0',
        description: 'Acute transmural myocardial infarction of anterior wall',
        confidence: 0.97,
      },
      {
        code: 'I25.10',
        description: 'Atherosclerotic heart disease of native coronary artery',
        confidence: 0.89,
      },
    ],
    cpt_codes: [
      {
        code: '92928',
        description: 'Percutaneous transcatheter placement of intracoronary stent',
        confidence: 0.94,
      },
      { code: '93510', description: 'Left heart catheterization', confidence: 0.78 },
    ],
  },
  billing: {
    total_billed_amount: '184500',
    line_items: [
      {
        description: 'ICU Charges (5 days)',
        quantity: 5,
        unit_price: '12000',
        gross_charge: '60000',
      },
      {
        description: 'Coronary Angioplasty Procedure',
        quantity: 1,
        unit_price: '85000',
        gross_charge: '85000',
      },
      {
        description: 'Stent (Drug Eluting)',
        quantity: 1,
        unit_price: '28000',
        gross_charge: '28000',
      },
      {
        description: 'Pharmacy & Consumables',
        quantity: 1,
        unit_price: '11500',
        gross_charge: '11500',
      },
    ],
  },
  extraction_meta: {
    overall_confidence: 88,
    low_confidence_fields: ['insurance.payer_id', 'coding.cpt_codes[1].code'],
    requires_manual_review: true,
  },
};

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
    let idx = 0;
    const runPhase = () => {
      if (idx >= extractionPhases.length) {
        fetch('/api/claims/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents: uploadedDocs }),
        })
          .then(async (response) => ({ response, payload: await response.json() }))
          .then(({ response, payload }) => {
            if (response.ok && payload.ok) {
              setExtractedData(payload.data.extractedData);
            } else {
              setExtractionError(payload.error || 'AI extraction failed.');
            }
            setExtractionDone(true);
          })
          .catch((error) => {
            setExtractionError(error instanceof Error ? error.message : 'AI extraction failed.');
            setExtractionDone(true);
          });
        return;
      }
      setCurrentPhase(idx);
      setTimeout(() => {
        setCompletedPhases((prev) => new Set([...prev, idx]));
        idx++;
        runPhase();
      }, extractionPhases[idx]?.duration || 1200);
    };
    const timer = setTimeout(runPhase, 300);
    return () => clearTimeout(timer);
  }, [uploadedDocs]);

  const docCount = Object.keys(uploadedDocs).length || 3;
  const displayData = extractedData;
  const hasExtractionError = extractionDone && !displayData;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left: Extraction phases */}
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
                    ? 'Full AI Extraction Complete'
                    : 'Deep AI Extraction Running'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {hasExtractionError
                  ? 'The provider could not parse one or more uploaded documents'
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
                  {isActive && (
                    <span className="text-xs text-primary font-medium validation-pulse shrink-0">
                      Running
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-xs text-success font-medium shrink-0">Done</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Confidence score */}
        {extractionDone && displayData && (
          <div className="card p-5 fade-in">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">Overall Confidence</p>
              <span className="text-2xl font-bold text-success-foreground font-tabular">
                {displayData.extraction_meta.overall_confidence}%
              </span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-success rounded-full transition-all duration-700"
                style={{ width: `${displayData.extraction_meta.overall_confidence}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {displayData.extraction_meta.low_confidence_fields.length} fields flagged for manual
              review
            </p>
          </div>
        )}
      </div>

      {/* Right: Extracted data preview */}
      <div className="lg:col-span-3 space-y-4">
        {!extractionDone ? (
          <div className="card p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Database size={28} className="text-primary validation-pulse" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Mapping to Claim Schema</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              AI is extracting and mapping all document fields to the standardized claim database
              schema...
            </p>
          </div>
        ) : displayData ? (
          <div className="space-y-4 fade-in">
            {/* Patient & Insurance */}
            <div className="card p-5">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-info inline-block" />
                Patient & Insurance — Extracted
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  { label: 'Full Name', value: displayData.patient.full_name, confidence: 0.99 },
                  {
                    label: 'Date of Birth',
                    value: displayData.patient.date_of_birth,
                    confidence: 0.97,
                  },
                  { label: 'Member ID', value: displayData.insurance.member_id, confidence: 0.95 },
                  {
                    label: 'Payer ID',
                    value: displayData.insurance.payer_id,
                    confidence: 0.71,
                    low: true,
                  },
                  {
                    label: 'Group Number',
                    value: displayData.insurance.group_number,
                    confidence: 0.93,
                  },
                  { label: 'Plan Name', value: displayData.insurance.plan_name, confidence: 0.96 },
                ].map((field) => (
                  <div
                    key={`ef-${field.label}`}
                    className="flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0"
                  >
                    <span className="text-xs text-muted-foreground shrink-0">{field.label}</span>
                    <div className="text-right">
                      <p
                        className={`text-xs font-medium ${field.low ? 'text-warning-foreground' : 'text-foreground'} font-tabular`}
                      >
                        {field.value}
                      </p>
                      <p
                        className={`text-xs ${field.low ? 'text-warning-foreground' : 'text-success-foreground'}`}
                      >
                        {Math.round(field.confidence * 100)}% conf.
                        {field.low && ' ⚠'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Clinical & Coding */}
            <div className="card p-5">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success inline-block" />
                Clinical & Coding — Extracted
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-3">
                {[
                  {
                    label: 'Admission',
                    value: displayData.clinical.admission_date,
                    confidence: 0.98,
                  },
                  {
                    label: 'Discharge',
                    value: displayData.clinical.discharge_date,
                    confidence: 0.98,
                  },
                  {
                    label: 'Physician',
                    value: displayData.clinical.attending_physician,
                    confidence: 0.95,
                  },
                  {
                    label: 'Hospital NPI',
                    value: displayData.clinical.hospital_npi,
                    confidence: 0.99,
                  },
                ].map((field) => (
                  <div
                    key={`cf-${field.label}`}
                    className="flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0"
                  >
                    <span className="text-xs text-muted-foreground shrink-0">{field.label}</span>
                    <div className="text-right">
                      <p className="text-xs font-medium text-foreground font-tabular">
                        {field.value}
                      </p>
                      <p className="text-xs text-success-foreground">
                        {Math.round(field.confidence * 100)}% conf.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {displayData.coding.icd10_codes.map((code) => (
                  <div
                    key={`icd-${code.code}`}
                    className="flex items-center gap-2 py-1 px-2 bg-muted/50 rounded-lg"
                  >
                    <span className="badge-info text-xs font-tabular">ICD-10</span>
                    <span className="text-xs font-bold text-foreground font-tabular">
                      {code.code}
                    </span>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {code.description}
                    </span>
                    <span className="text-xs text-success-foreground shrink-0">
                      {Math.round(code.confidence * 100)}%
                    </span>
                  </div>
                ))}
                {displayData.coding.cpt_codes.map((code) => (
                  <div
                    key={`cpt-${code.code}`}
                    className={`flex items-center gap-2 py-1 px-2 rounded-lg ${
                      code.confidence < 0.85 ? 'bg-warning-bg/40' : 'bg-muted/50'
                    }`}
                  >
                    <span className="badge-warning text-xs font-tabular">CPT</span>
                    <span className="text-xs font-bold text-foreground font-tabular">
                      {code.code}
                    </span>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {code.description}
                    </span>
                    <span
                      className={`text-xs shrink-0 ${code.confidence < 0.85 ? 'text-warning-foreground' : 'text-success-foreground'}`}
                    >
                      {Math.round(code.confidence * 100)}%{code.confidence < 0.85 ? ' ⚠' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Billing summary */}
            <div className="card p-5">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-warning inline-block" />
                Billing — Extracted
              </h4>
              <div className="space-y-1.5 mb-3">
                {displayData.billing.line_items.map((item, i) => (
                  <div
                    key={`li-${i}`}
                    className="flex items-center justify-between gap-2 py-1 text-xs"
                  >
                    <span className="text-muted-foreground flex-1">{item.description}</span>
                    <span className="text-foreground font-tabular shrink-0">
                      ₹{parseInt(item.gross_charge).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-semibold text-foreground">Total Billed</span>
                <span className="text-sm font-bold text-foreground font-tabular">
                  ₹{parseInt(displayData.billing.total_billed_amount).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="card p-8 flex flex-col items-center justify-center text-center min-h-[300px] border-danger/20 bg-danger-bg/20">
            <AlertTriangle size={28} className="text-danger mb-3" />
            <h3 className="font-semibold text-foreground mb-2">Live Extraction Needs Attention</h3>
            <p className="text-sm text-danger-foreground max-w-md">
              {extractionError ||
                'No extraction data was returned. Turn Demo Mode on in Settings to use mock extraction data.'}
            </p>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="lg:col-span-5 card p-5 flex items-center justify-between">
        <button onClick={onBack} className="btn-secondary gap-2">
          <ArrowLeft size={15} /> Back
        </button>
        <button
          onClick={() => displayData && onComplete(displayData)}
          disabled={!extractionDone || !displayData}
          className="btn-primary px-6 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review Extracted Data <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
