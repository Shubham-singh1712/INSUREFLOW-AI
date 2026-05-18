'use client';

// Re-export legacy types consumed by old step components
export type { UploadedDoc, ExtractedClaimData } from './types';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import UploadZone from './UploadZone';
import ProcessingScreen from './ProcessingScreen';
import AnalysisResults from './AnalysisResults';
import type { ExtractedClaimData } from './types';

const createClaimId = () => `CLM-${String(1000 + Math.floor(Math.random() * 9000))}`;

export type FlowState = 'empty' | 'processing' | 'ready';

export type Packet = {
  name: string;
  size: string;
  pages: number;
  uploadedAt: string;
};

export type ClaimFieldKey =
  | 'patientName'
  | 'insuranceNumber'
  | 'diagnosis'
  | 'doctorName'
  | 'hospital'
  | 'procedure'
  | 'invoiceTotal'
  | 'claimType';

export type ClaimField = {
  id: ClaimFieldKey;
  label: string;
  value: string;
  confidence: number;
  source: string;
};

export type ValidationIssue = {
  id: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  confidence: number;
  title: string;
  reference: string;
  fix: string;
  evidence?: string;
};

export type DocumentGroup = {
  id: string;
  title: string;
  pages: string;
  confidence: number;
  status: string;
  summary: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
};

export type ValidationMetric = {
  id: string;
  label: string;
  value: string;
  unit: string;
  color: string;
  helper: string;
};

export type ValidationReport = {
  documentGroups: DocumentGroup[];
  metrics: ValidationMetric[];
  issues: ValidationIssue[];
  timeline: Array<{ id: string; label: string; time: string; done: boolean }>;
  pdfStructure: string[];
  summary: string;
  readinessScore: number;
  healthScore: number;
  ocrConfidence: number;
  source: 'ai' | 'local_analysis';
  extractionMethod: 'pdf_text' | 'ocr_required' | 'ai_ocr';
};

type ReviewClaimRecord = {
  claimId: string;
  patient: string;
  submittedAt: string;
  documentsTotal: number;
  confirmedData: ExtractedClaimData;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatCurrency = (value: string) => {
  const amount = Number.parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(amount) && amount > 0 ? `INR ${amount.toLocaleString('en-IN')}` : value;
};

const confidenceFromPaths = (data: ExtractedClaimData, fallback: number, ...paths: string[]) => {
  const lowConfidence = new Set(data.extraction_meta.low_confidence_fields);
  return paths.some((path) => lowConfidence.has(path))
    ? Math.max(72, fallback - 12)
    : Math.min(99, fallback);
};

const buildClaimType = (data: ExtractedClaimData) => {
  const parts = [
    data.pre_authorization.approval_code && 'Pre-authorized',
    data.clinical.admission_date && data.clinical.discharge_date && 'inpatient',
    data.coding.cpt_codes.length > 0 && 'procedural',
    'claim',
  ].filter(Boolean);

  return parts.join(' ');
};

const mapExtractedDataToClaimFields = (data: ExtractedClaimData): ClaimField[] => {
  const diagnosisCode = data.coding.icd10_codes[0];
  const procedureCode = data.coding.cpt_codes[0];
  const baseConfidence = Math.max(78, Math.min(99, data.extraction_meta.overall_confidence || 82));

  return [
    {
      id: 'patientName',
      label: 'Patient name',
      value: data.patient.full_name || 'Not found',
      confidence: confidenceFromPaths(data, baseConfidence + 8, 'patient.full_name'),
      source: 'Patient intake form · PDF extraction',
    },
    {
      id: 'insuranceNumber',
      label: 'Insurance number',
      value: data.insurance.member_id || 'Not found',
      confidence: confidenceFromPaths(data, baseConfidence + 4, 'insurance.member_id'),
      source: 'Insurance card · PDF extraction',
    },
    {
      id: 'diagnosis',
      label: 'Diagnosis',
      value:
        diagnosisCode?.description && diagnosisCode?.code
          ? `${diagnosisCode.code} - ${diagnosisCode.description}`
          : data.clinical.principal_diagnosis || 'Not found',
      confidence: confidenceFromPaths(data, baseConfidence + 2, 'clinical.principal_diagnosis'),
      source: 'Discharge summary · PDF extraction',
    },
    {
      id: 'doctorName',
      label: 'Attending physician',
      value: data.clinical.attending_physician || 'Not found',
      confidence: confidenceFromPaths(data, baseConfidence + 1, 'clinical.attending_physician'),
      source: 'Discharge summary · PDF extraction',
    },
    {
      id: 'hospital',
      label: 'Hospital / Facility',
      value: data.clinical.facility_name || 'Not found',
      confidence: confidenceFromPaths(data, baseConfidence + 5, 'clinical.facility_name'),
      source: 'Hospital records · PDF extraction',
    },
    {
      id: 'procedure',
      label: 'Procedure',
      value:
        procedureCode?.description && procedureCode?.code
          ? `${procedureCode.code} - ${procedureCode.description}`
          : 'Not found',
      confidence:
        procedureCode && Number.isFinite(procedureCode.confidence)
          ? Math.max(72, Math.min(99, Math.round(procedureCode.confidence * 100)))
          : Math.max(72, baseConfidence - 6),
      source: 'Coding summary · PDF extraction',
    },
    {
      id: 'invoiceTotal',
      label: 'Invoice total',
      value: formatCurrency(data.billing.total_billed_amount || 'Not found'),
      confidence:
        data.billing.total_billed_amount && data.billing.total_billed_amount !== '0'
          ? baseConfidence
          : Math.max(72, baseConfidence - 10),
      source: 'Itemized bill · PDF extraction',
    },
    {
      id: 'claimType',
      label: 'Claim metadata',
      value: buildClaimType(data),
      confidence: Math.max(72, baseConfidence - 2),
      source: 'Claim packet context',
    },
  ];
};

export const initialClaimFields: ClaimField[] = [
  {
    id: 'patientName',
    label: 'Patient name',
    value: 'Not found',
    confidence: 0,
    source: 'Awaiting PDF extraction',
  },
  {
    id: 'insuranceNumber',
    label: 'Insurance number',
    value: 'Not found',
    confidence: 0,
    source: 'Awaiting PDF extraction',
  },
  {
    id: 'diagnosis',
    label: 'Diagnosis',
    value: 'Not found',
    confidence: 0,
    source: 'Awaiting PDF extraction',
  },
  {
    id: 'doctorName',
    label: 'Attending physician',
    value: 'Not found',
    confidence: 0,
    source: 'Awaiting PDF extraction',
  },
  {
    id: 'hospital',
    label: 'Hospital / Facility',
    value: 'Not found',
    confidence: 0,
    source: 'Awaiting PDF extraction',
  },
  {
    id: 'procedure',
    label: 'Procedure',
    value: 'Not found',
    confidence: 0,
    source: 'Awaiting PDF extraction',
  },
  {
    id: 'invoiceTotal',
    label: 'Invoice total',
    value: 'Not found',
    confidence: 0,
    source: 'Awaiting PDF extraction',
  },
  {
    id: 'claimType',
    label: 'Claim metadata',
    value: 'Not found',
    confidence: 0,
    source: 'Awaiting PDF extraction',
  },
];

export const emptyValidationReport: ValidationReport = {
  documentGroups: [],
  metrics: [
    {
      id: 'health',
      label: 'Claim Health',
      value: '0',
      unit: '/100',
      color: 'text-danger',
      helper: 'Upload a PDF to analyze',
    },
    {
      id: 'readiness',
      label: 'Readiness',
      value: '0',
      unit: '%',
      color: 'text-danger',
      helper: 'Validation not started',
    },
    {
      id: 'ocr',
      label: 'OCR Confidence',
      value: '0',
      unit: '%',
      color: 'text-danger',
      helper: 'No text extracted yet',
    },
    {
      id: 'risk',
      label: 'Rejection Risk',
      value: 'N/A',
      unit: '',
      color: 'text-muted-foreground',
      helper: 'Awaiting document',
    },
  ],
  issues: [],
  timeline: [],
  pdfStructure: [],
  summary: 'Upload a PDF packet to run dynamic validation.',
  readinessScore: 0,
  healthScore: 0,
  ocrConfidence: 0,
  source: 'local_analysis',
  extractionMethod: 'ocr_required',
};

export default function ClaimIntakeFlow() {
  const searchParams = useSearchParams();
  const [claimId, setClaimId] = useState(createClaimId);
  const [flowState, setFlowState] = useState<FlowState>('empty');
  const [packet, setPacket] = useState<Packet | null>(null);
  const [progress, setProgress] = useState(0);
  const [claimFields, setClaimFields] = useState<ClaimField[]>(initialClaimFields);
  const [validationReport, setValidationReport] = useState<ValidationReport>(emptyValidationReport);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    const reviewClaimId = searchParams.get('claimId');

    if (!reviewClaimId) return;

    let active = true;

    const loadReviewClaim = async () => {
      setReviewError('');
      setProgress(100);
      setPacket({
        name: 'Loading reviewed claim...',
        size: 'Fetching live review packet',
        pages: 1,
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      setFlowState('processing');

      try {
        const res = await fetch(`/api/claims/review?claimId=${encodeURIComponent(reviewClaimId)}`, {
          cache: 'no-store',
        });
        const payload = (await res.json().catch(() => null)) as {
          ok?: boolean;
          data?: ReviewClaimRecord;
          error?: string;
        } | null;

        if (!res.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.error || 'Unable to load the reviewed claim.');
        }

        if (!active) return;

        const reviewClaim = payload.data;
        const packetName =
          reviewClaim.patient
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'review';

        setClaimId(reviewClaim.claimId);
        setPacket({
          name: `${packetName}-claim-packet.pdf`,
          size: 'Live review packet',
          pages: reviewClaim.documentsTotal || 1,
          uploadedAt: new Date(reviewClaim.submittedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
        setClaimFields(mapExtractedDataToClaimFields(reviewClaim.confirmedData));
        setValidationReport({
          ...emptyValidationReport,
          summary: 'Loaded previously reviewed claim data.',
          readinessScore: 85,
          healthScore: 85,
          ocrConfidence: reviewClaim.confirmedData.extraction_meta.overall_confidence,
        });
        setFlowState('ready');
      } catch (error) {
        if (!active) return;

        setReviewError(
          error instanceof Error ? error.message : 'Unable to load the reviewed claim.'
        );
        setPacket(null);
        setFlowState('empty');
      }
    };

    void loadReviewClaim();

    return () => {
      active = false;
    };
  }, [searchParams]);

  const handlePacket = async (file?: File) => {
    setPacket({
      name: file?.name || 'uploaded-claim-packet.pdf',
      size: file ? formatFileSize(file.size) : '0 B',
      pages: 1,
      uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    setProgress(5);
    setFlowState('processing');

    // Simulate progress while waiting for the API
    const timer = setInterval(() => {
      setProgress((cur) => (cur < 90 ? cur + Math.floor(Math.random() * 5) : cur));
    }, 400);

    try {
      if (!file) {
        throw new Error('Upload a real PDF packet to run validation.');
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/extract-claim', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || 'AI extraction failed.');
      }

      if (Array.isArray(data.fields) && data.fields.length > 0) {
        setClaimFields(data.fields);
      }

      if (data.validation) {
        setValidationReport(data.validation);
      }

      if (Number.isFinite(data.pageCount)) {
        setPacket((current) => (current ? { ...current, pages: data.pageCount } : current));
      }
    } catch (e) {
      console.error(e);
      setValidationReport({
        ...emptyValidationReport,
        issues: [
          {
            id: 'processing-error',
            severity: 'High',
            confidence: 100,
            title: 'Document processing failed',
            reference: 'Upload pipeline',
            fix: e instanceof Error ? e.message : 'Try uploading a readable PDF packet again.',
          },
        ],
        summary: e instanceof Error ? e.message : 'Document processing failed.',
      });
    } finally {
      clearInterval(timer);
      setProgress(100);
      setTimeout(() => setFlowState('ready'), 500);
    }
  };

  const resetFlow = () => {
    setClaimId(createClaimId());
    setPacket(null);
    setProgress(0);
    setFlowState('empty');
    setClaimFields(initialClaimFields);
    setValidationReport(emptyValidationReport);
    setReviewError('');
  };

  const updateClaimField = (fieldId: ClaimFieldKey, value: string) => {
    setClaimFields((cur) => cur.map((f) => (f.id === fieldId ? { ...f, value } : f)));
  };

  return (
    <div className="max-w-7xl mx-auto">
      {reviewError && (
        <div className="card p-4 mb-4 border border-danger/20 bg-danger-bg/20 text-sm text-danger-foreground">
          {reviewError}
        </div>
      )}
      {flowState === 'empty' && <UploadZone claimId={claimId} onUpload={handlePacket} />}
      {flowState === 'processing' && packet && (
        <ProcessingScreen packet={packet} progress={progress} />
      )}
      {flowState === 'ready' && packet && (
        <AnalysisResults
          claimId={claimId}
          packet={packet}
          claimFields={claimFields}
          validationReport={validationReport}
          onUpdateField={updateClaimField}
          onReset={resetFlow}
        />
      )}
    </div>
  );
}
