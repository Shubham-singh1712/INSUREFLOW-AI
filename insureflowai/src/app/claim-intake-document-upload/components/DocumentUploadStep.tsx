'use client';
import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, FlaskConical, Pill, CreditCard, Receipt, CheckCircle2, AlertTriangle, X, ArrowRight, Camera, Info,  } from 'lucide-react';
import type { UploadedDoc } from './ClaimIntakeFlow';

interface DocumentUploadStepProps {
  onNext: (docs: Record<string, UploadedDoc>) => void;
}

const documentTypes = [
  {
    id: 'intake_form',
    label: 'Intake Form',
    description: 'Patient intake / admission form with demographics',
    icon: FileText,
    iconBg: 'bg-info-bg',
    iconColor: 'text-info',
    required: true,
    acceptedFormats: 'PDF, JPG, PNG',
    tips: 'Must include patient full name and date of birth',
  },
  {
    id: 'insurance_card',
    label: 'Insurance Card',
    description: 'Front and back scan of the health insurance card',
    icon: CreditCard,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    required: true,
    acceptedFormats: 'JPG, PNG, PDF',
    tips: 'Ensure member ID, group number and payer ID are visible',
  },
  {
    id: 'pre_authorization',
    label: 'Pre-Authorization',
    description: 'Pre-auth approval document with authorization code',
    icon: CheckCircle2,
    iconBg: 'bg-success-bg',
    iconColor: 'text-success',
    required: false,
    acceptedFormats: 'PDF, JPG, PNG',
    tips: 'Include approval code and authorized date range',
  },
  {
    id: 'discharge_summary',
    label: 'Discharge Summary / EHR',
    description: 'Clinical document with diagnosis, treatment and physician notes',
    icon: FlaskConical,
    iconBg: 'bg-warning-bg',
    iconColor: 'text-warning',
    required: true,
    acceptedFormats: 'PDF, JPG, PNG',
    tips: 'Must include attending physician signature and hospital stamp',
  },
  {
    id: 'coding_summary',
    label: 'Coding Summary',
    description: 'ICD-10 diagnosis codes, CPT/HCPCS procedure codes and modifiers',
    icon: Pill,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    required: true,
    acceptedFormats: 'PDF, JPG, PNG',
    tips: 'Include all diagnosis and procedure codes with modifiers',
  },
  {
    id: 'itemized_bill',
    label: 'Itemized Bill',
    description: 'Line-item hospital bill with quantities and gross charges',
    icon: Receipt,
    iconBg: 'bg-danger-bg',
    iconColor: 'text-danger',
    required: true,
    acceptedFormats: 'PDF, JPG',
    tips: 'Final consolidated bill with hospital letterhead and stamp',
  },
];

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DocumentUploadStep({ onNext }: DocumentUploadStepProps) {
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const simulateUpload = useCallback((docId: string, file: File) => {
    const doc: UploadedDoc = {
      name: file.name,
      size: formatFileSize(file.size),
      status: 'uploading',
      progress: 0,
    };

    setUploadedDocs(prev => ({ ...prev, [docId]: doc }));

    let progress = 0;
    const uploadInterval = setInterval(() => {
      progress += Math.floor(Math.random() * 18) + 8;
      if (progress >= 100) {
        clearInterval(uploadInterval);
        progress = 100;
        setUploadedDocs(prev => ({
          ...prev,
          [docId]: { ...prev[docId], progress: 100, status: 'processing', message: 'Running OCR extraction...' },
        }));

        setTimeout(() => {
          const outcomes: Array<UploadedDoc['status']> = ['passed', 'passed', 'passed', 'warning', 'passed'];
          const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
          const messages: Record<string, string> = {
            passed: 'OCR extraction complete — all fields detected',
            warning: 'Low image quality — text extraction partial',
            failed: 'OCR failed — document unreadable',
          };
          setUploadedDocs(prev => ({
            ...prev,
            [docId]: {
              ...prev[docId],
              status: outcome,
              message: messages[outcome] || messages.passed,
            },
          }));
        }, 1800);
      } else {
        setUploadedDocs(prev => ({
          ...prev,
          [docId]: { ...prev[docId], progress },
        }));
      }
    }, 120);
  }, []);

  const syncUploadWithApi = async (docId: string, file: File) => {
    const formData = new FormData();
    formData.append('documentType', docId);
    formData.append('file', file);

    try {
      const response = await fetch('/api/claims/uploads', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setUploadedDocs(prev => ({
          ...prev,
          [docId]: { ...prev[docId], status: 'failed', progress: 100, message: payload.error || 'Upload failed' },
        }));
      }
    } catch {
      setUploadedDocs(prev => ({
        ...prev,
        [docId]: { ...prev[docId], status: 'failed', progress: 100, message: 'Upload failed. Please try again.' },
      }));
    }
  };

  const handleFileSelect = (docId: string, file: File) => {
    syncUploadWithApi(docId, file);
    simulateUpload(docId, file);
  };

  const handleDrop = useCallback((e: React.DragEvent, docId: string) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) {
      syncUploadWithApi(docId, file);
      simulateUpload(docId, file);
    }
  }, [simulateUpload]);

  const handleRemove = (docId: string) => {
    setUploadedDocs(prev => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  };

  const requiredDocs = documentTypes.filter(d => d.required);
  const uploadedRequired = requiredDocs.filter(d =>
    uploadedDocs[d.id]?.status === 'passed' || uploadedDocs[d.id]?.status === 'warning'
  );
  const canProceed = uploadedRequired.length >= requiredDocs.length - 1;
  const totalUploaded = Object.keys(uploadedDocs).length;

  return (
    <div>
      {/* Upload summary bar */}
      <div className="card p-4 mb-6 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Upload size={15} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground font-tabular">{totalUploaded} / {documentTypes.length}</p>
            <p className="text-xs text-muted-foreground">Documents uploaded</p>
          </div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-success-bg flex items-center justify-center">
            <CheckCircle2 size={15} className="text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground font-tabular">
              {Object.values(uploadedDocs).filter(d => d.status === 'passed').length}
            </p>
            <p className="text-xs text-muted-foreground">OCR passed</p>
          </div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-warning-bg flex items-center justify-center">
            <AlertTriangle size={15} className="text-warning" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground font-tabular">
              {Object.values(uploadedDocs).filter(d => d.status === 'warning' || d.status === 'failed').length}
            </p>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="badge-info">
            <Info size={10} /> 5 required · 1 optional
          </span>
        </div>
      </div>

      {/* Document upload zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {documentTypes.map((docType) => {
          const uploaded = uploadedDocs[docType.id];
          const isDragTarget = dragOver === docType.id;

          return (
            <div
              key={`doczone-${docType.id}`}
              className={`card overflow-hidden transition-all duration-200 ${
                isDragTarget ? 'border-accent shadow-card-md scale-[1.01]' : ''
              } ${uploaded?.status === 'passed' ? 'border-success/30' : ''}
              ${uploaded?.status === 'warning' ? 'border-warning/30' : ''}
              ${uploaded?.status === 'failed' ? 'border-danger/30' : ''}`}
            >
              {/* Card header */}
              <div className="px-4 pt-4 pb-3 flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl ${docType.iconBg} flex items-center justify-center shrink-0`}>
                  <docType.icon size={16} className={docType.iconColor} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{docType.label}</p>
                    {docType.required
                      ? <span className="text-xs text-danger font-bold">Required</span>
                      : <span className="badge-muted text-xs">Optional</span>
                    }
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{docType.description}</p>
                </div>
              </div>

              {/* Upload zone or uploaded state */}
              <div className="px-4 pb-4">
                {!uploaded ? (
                  <div
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                      isDragTarget
                        ? 'border-primary bg-primary/5' :'border-border hover:border-primary/40 hover:bg-muted/50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(docType.id); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => handleDrop(e, docType.id)}
                    onClick={() => fileInputRefs.current[docType.id]?.click()}
                  >
                    <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs font-medium text-foreground mb-0.5">Drop file or click to upload</p>
                    <p className="text-xs text-muted-foreground">{docType.acceptedFormats} · Max 20MB</p>
                    <input
                      ref={(el) => { fileInputRefs.current[docType.id] = el; }}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(docType.id, file);
                      }}
                    />
                  </div>
                ) : (
                  <div className={`rounded-xl border p-3 ${
                    uploaded.status === 'passed' ? 'bg-success-bg/40 border-success/20' :
                    uploaded.status === 'warning' ? 'bg-warning-bg/40 border-warning/20' :
                    uploaded.status === 'failed'? 'bg-danger-bg/40 border-danger/20' : 'bg-muted/50 border-border'
                  }`}>
                    {/* File info */}
                    <div className="flex items-center gap-2 mb-2">
                      <FileText size={14} className="text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate flex-1">{uploaded.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{uploaded.size}</span>
                      <button
                        onClick={() => handleRemove(docType.id)}
                        className="w-5 h-5 rounded-md hover:bg-muted flex items-center justify-center shrink-0"
                      >
                        <X size={11} className="text-muted-foreground" />
                      </button>
                    </div>

                    {/* Progress bar */}
                    {(uploaded.status === 'uploading' || uploaded.status === 'processing') && (
                      <div className="mb-2">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${uploaded.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {uploaded.status === 'uploading' ? `Uploading ${uploaded.progress}%` : uploaded.message}
                        </p>
                      </div>
                    )}

                    {/* Status */}
                    {(uploaded.status === 'passed' || uploaded.status === 'warning' || uploaded.status === 'failed') && (
                      <div className="flex items-center gap-1.5">
                        {uploaded.status === 'passed' && <CheckCircle2 size={12} className="text-success" />}
                        {uploaded.status === 'warning' && <AlertTriangle size={12} className="text-warning" />}
                        {uploaded.status === 'failed' && <X size={12} className="text-danger" />}
                        <span className={`text-xs font-medium ${
                          uploaded.status === 'passed' ? 'text-success-foreground' :
                          uploaded.status === 'warning' ? 'text-warning-foreground' : 'text-danger-foreground'
                        }`}>{uploaded.message}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Tip */}
                <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
                  <Camera size={10} className="shrink-0 mt-0.5" />
                  {docType.tips}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {canProceed
              ? 'Documents ready — proceed to pre-processing check'
              : `Upload at least ${requiredDocs.length - 1} required documents to continue`
            }
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI will run a gatekeeper check to verify patient name before full extraction
          </p>
        </div>
        <button
          onClick={() => onNext(uploadedDocs)}
          disabled={!canProceed}
          className="btn-primary px-6 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Run Pre-Processing Check <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
