'use client';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import DocumentUploadStep from './DocumentUploadStep';
import GatekeeperStep from './GatekeeperStep';
import AIExtractionStep from './AIExtractionStep';
import ReviewConfirmStep from './ReviewConfirmStep';
import ClaimScrubbingStep from './ClaimScrubbingStep';
import FinalSubmissionStep from './FinalSubmissionStep';

const steps = [
  {
    id: 'step-upload',
    number: 1,
    label: 'Document Upload',
    description: 'Upload hospital documents',
  },
  {
    id: 'step-gatekeeper',
    number: 2,
    label: 'Pre-Processing',
    description: 'Gatekeeper validation',
  },
  {
    id: 'step-extraction',
    number: 3,
    label: 'AI Extraction',
    description: 'Deep OCR & NLP mapping',
  },
  { id: 'step-review', number: 4, label: 'Review & Confirm', description: 'Verify extracted data' },
  {
    id: 'step-scrubbing',
    number: 5,
    label: 'Claim Scrubbing',
    description: 'Automated constraints',
  },
  { id: 'step-submission', number: 6, label: 'Final Submission', description: 'UB-04 & EDI 837I' },
];

const createClaimId = () => `CLM-${String(1000 + Math.floor(Math.random() * 9000))}`;

export interface UploadedDoc {
  name: string;
  size: string;
  status: 'uploading' | 'processing' | 'passed' | 'failed' | 'warning';
  progress: number;
  message?: string;
  documentType?: string;
  mimeType?: string;
  dataUrl?: string;
}

export interface ExtractedClaimData {
  patient: {
    full_name: string;
    date_of_birth: string;
    gender: string;
    address: string;
    contact_phone: string;
    contact_email: string;
  };
  insurance: {
    policyholder_name: string;
    group_number: string;
    member_id: string;
    payer_id: string;
    plan_name: string;
  };
  pre_authorization: {
    approval_code: string;
    authorized_from: string;
    authorized_to: string;
  };
  clinical: {
    admission_date: string;
    discharge_date: string;
    attending_physician: string;
    hospital_npi: string;
    hospital_tax_id: string;
    facility_name: string;
    principal_diagnosis: string;
  };
  coding: {
    icd10_codes: Array<{ code: string; description: string; confidence: number }>;
    cpt_codes: Array<{ code: string; description: string; confidence: number }>;
  };
  billing: {
    total_billed_amount: string;
    line_items: Array<{
      description: string;
      quantity: number;
      unit_price: string;
      gross_charge: string;
    }>;
  };
  extraction_meta: {
    overall_confidence: number;
    low_confidence_fields: string[];
    requires_manual_review: boolean;
  };
}

export default function ClaimIntakeFlow() {
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [claimId, setClaimId] = useState(createClaimId);
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({});
  const [extractedData, setExtractedData] = useState<ExtractedClaimData | null>(null);
  const [confirmedData, setConfirmedData] = useState<ExtractedClaimData | null>(null);

  useEffect(() => {
    const reviewClaimId = searchParams.get('claimId');
    if (!reviewClaimId) return;

    const loadReviewClaim = async () => {
      const response = await fetch(
        `/api/claims/review?claimId=${encodeURIComponent(reviewClaimId)}`
      );
      const payload = await response.json().catch(() => null);
      const data = payload?.data?.confirmedData as ExtractedClaimData | undefined;
      if (!response.ok || !data) return;

      setClaimId(reviewClaimId);
      setExtractedData(data);
      setConfirmedData(data);
      setCurrentStep(4);
    };

    void loadReviewClaim();
  }, [searchParams]);

  const handleDocumentsNext = (docs: Record<string, UploadedDoc>) => {
    setUploadedDocs(docs);
    setCurrentStep(2);
  };

  const handleGatekeeperPass = () => {
    setCurrentStep(3);
  };

  const handleExtractionComplete = (data: ExtractedClaimData) => {
    setExtractedData(data);
    setCurrentStep(4);
  };

  const handleReviewConfirm = (data: ExtractedClaimData) => {
    setConfirmedData(data);
    setCurrentStep(5);
  };

  const handleScrubbingPass = () => {
    setCurrentStep(6);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <a href="/main-dashboard" className="hover:text-primary transition-colors">
            Dashboard
          </a>
          <ChevronRight size={14} />
          <span className="text-foreground font-medium">New Claim Intake</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Claim Intake</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload documents to begin — AI extracts and validates all claim data automatically
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-xl border border-border">
            <span className="text-xs text-muted-foreground font-medium">Claim ID</span>
            <span className="text-sm font-bold text-foreground font-tabular">{claimId}</span>
            <span className="badge-info ml-1">Draft</span>
          </div>
        </div>
      </div>

      {/* Step progress */}
      <div className="card p-6 mb-6">
        <div className="flex items-center">
          {steps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                    currentStep > step.number
                      ? 'bg-success text-white'
                      : currentStep === step.number
                        ? 'bg-primary text-white shadow-md'
                        : 'bg-muted border-2 border-border text-muted-foreground'
                  }`}
                >
                  {currentStep > step.number ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <span className="text-sm font-bold">{step.number}</span>
                  )}
                </div>
                <div className="hidden lg:block">
                  <p
                    className={`text-xs font-semibold leading-tight ${
                      currentStep >= step.number ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-3 transition-all duration-500 ${
                    currentStep > step.number ? 'bg-success' : 'bg-border'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="fade-in">
        {currentStep === 1 && <DocumentUploadStep onNext={handleDocumentsNext} />}
        {currentStep === 2 && (
          <GatekeeperStep
            uploadedDocs={uploadedDocs}
            onPass={handleGatekeeperPass}
            onBack={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 3 && (
          <AIExtractionStep
            uploadedDocs={uploadedDocs}
            onComplete={handleExtractionComplete}
            onBack={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 4 && extractedData && (
          <ReviewConfirmStep
            extractedData={extractedData}
            onConfirm={handleReviewConfirm}
            onBack={() => setCurrentStep(3)}
          />
        )}
        {currentStep === 5 && confirmedData && (
          <ClaimScrubbingStep
            claimId={claimId}
            confirmedData={confirmedData}
            onPass={handleScrubbingPass}
            onBack={() => setCurrentStep(4)}
          />
        )}
        {currentStep === 6 && (
          <FinalSubmissionStep claimId={claimId} confirmedData={confirmedData} />
        )}
      </div>
    </div>
  );
}
