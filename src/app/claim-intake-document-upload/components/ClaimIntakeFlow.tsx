'use client';

// Re-export legacy types consumed by old step components
export type { UploadedDoc, ExtractedClaimData } from './types';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import UploadZone from './UploadZone';
import ProcessingScreen from './ProcessingScreen';
import AnalysisResults from './AnalysisResults';

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

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const initialClaimFields: ClaimField[] = [
  { id: 'patientName', label: 'Patient name', value: 'Ramesh Kumar Iyer', confidence: 99, source: 'Insurance card · Page 1' },
  { id: 'insuranceNumber', label: 'Insurance number', value: 'MEM-7748291034', confidence: 96, source: 'Insurance card · Page 1' },
  { id: 'diagnosis', label: 'Diagnosis', value: 'I21.0 – Acute myocardial infarction', confidence: 94, source: 'Discharge summary · Page 3' },
  { id: 'doctorName', label: 'Attending physician', value: 'Dr. Suresh Babu', confidence: 92, source: 'Discharge summary · Page 4' },
  { id: 'hospital', label: 'Hospital / Facility', value: 'Apollo Hospitals, Greams Road', confidence: 98, source: 'Invoice · Page 9' },
  { id: 'procedure', label: 'Procedure', value: 'Coronary angioplasty with stent', confidence: 89, source: 'Invoice · Page 10' },
  { id: 'invoiceTotal', label: 'Invoice total', value: 'INR 1,84,500', confidence: 87, source: 'Invoice · Page 12' },
  { id: 'claimType', label: 'Claim metadata', value: 'Cashless inpatient cardiac claim', confidence: 93, source: 'AI packet context' },
];

export default function ClaimIntakeFlow() {
  const searchParams = useSearchParams();
  const [claimId] = useState(createClaimId);
  const [flowState, setFlowState] = useState<FlowState>('empty');
  const [packet, setPacket] = useState<Packet | null>(null);
  const [progress, setProgress] = useState(0);
  const [claimFields, setClaimFields] = useState(initialClaimFields);

  useEffect(() => {
    const reviewClaimId = searchParams.get('claimId');
    if (reviewClaimId) {
      setPacket({ name: 'review-needed-claim-packet.pdf', size: '8.4 MB', pages: 12, uploadedAt: '10:42 AM' });
      setProgress(100);
      setFlowState('ready');
    }
  }, [searchParams]);

  useEffect(() => {
    if (flowState !== 'processing') return;
    const timer = window.setInterval(() => {
      setProgress((cur) => {
        const next = Math.min(cur + 3 + Math.floor(Math.random() * 5), 100);
        if (next >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => setFlowState('ready'), 600);
        }
        return next;
      });
    }, 380);
    return () => window.clearInterval(timer);
  }, [flowState]);

  const handlePacket = (file?: File) => {
    setPacket({
      name: file?.name || 'combined-claim-packet-ramesh-iyer.pdf',
      size: file ? formatFileSize(file.size) : '8.4 MB',
      pages: 12,
      uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    setProgress(2);
    setFlowState('processing');
  };

  const resetFlow = () => {
    setPacket(null);
    setProgress(0);
    setFlowState('empty');
    setClaimFields(initialClaimFields);
  };

  const updateClaimField = (fieldId: ClaimFieldKey, value: string) => {
    setClaimFields((cur) => cur.map((f) => (f.id === fieldId ? { ...f, value } : f)));
  };

  return (
    <div className="max-w-7xl mx-auto">
      {flowState === 'empty' && (
        <UploadZone claimId={claimId} onUpload={handlePacket} />
      )}
      {flowState === 'processing' && packet && (
        <ProcessingScreen packet={packet} progress={progress} />
      )}
      {flowState === 'ready' && packet && (
        <AnalysisResults
          claimId={claimId}
          packet={packet}
          claimFields={claimFields}
          onUpdateField={updateClaimField}
          onReset={resetFlow}
        />
      )}
    </div>
  );
}
