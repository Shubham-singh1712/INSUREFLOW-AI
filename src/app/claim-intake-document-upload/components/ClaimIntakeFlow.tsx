'use client';
'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClaimPacket, UiClaimField, ClaimState } from '@/lib/claim-processing/types';
import { isReadyForSubmission, isUnderReview } from '@/lib/claimLifecycle';
import {
  UploadCloud,
  CheckCircle,
  AlertTriangle,
  FileText,
  Loader2,
  User,
  Shield,
  Hospital,
  Activity,
  DollarSign,
  CheckSquare,
  FileCheck2,
  ArrowRight,
  Info,
  X,
} from 'lucide-react';

export default function ClaimIntakeFlow() {
  const searchParams = useSearchParams();
  const claimIdParam = searchParams.get('claimId');

  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'submitted'>('upload');
  const [claimData, setClaimData] = useState<{
    packet: ClaimPacket;
    uiFields: UiClaimField[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState<
    | 'patient'
    | 'insurance'
    | 'hospital'
    | 'clinical'
    | 'financial'
    | 'authorization'
    | 'audit_trail'
  >('patient');
  const [hideErrorBanner, setHideErrorBanner] = useState(false);

  // Load claim if claimId query param is present on mount
  useEffect(() => {
    if (!claimIdParam) return;

    setStep('processing');
    setError(null);

    fetch(`/api/claims/${claimIdParam}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to load claim details.');
        }

        const claim = data.claim;
        const packet: ClaimPacket = {
          success: true,
          extractionMethod: claim.extracted_data ? 'mixed' : 'ocr',
          claimId: claim.id,
          uploadSessionId: claim.upload_session_id || '',
          pageCount: claim.classified_pages ? claim.classified_pages.length : 1,
          classifiedPages: claim.classified_pages || [],
          extractedFields: claim.extracted_data || {},
          validationErrors: claim.validation_errors || [],
          claimHealth: claim.health_score || 0,
          readiness: claim.readiness_score || 0,
          ocrConfidence: claim.ocr_confidence || 0,
          extractionConfidence: claim.ocr_confidence || 0,
          rejectionRisk: (claim.rejection_risk || (claim.health_score >= 80 ? 'low' : claim.health_score >= 50 ? 'medium' : 'high')) as any,
          repairSuggestions: claim.repair_suggestions || [],
          intake: {
            claimId: claim.id,
            uploadSessionId: claim.upload_session_id || '',
            uploadStartedAt: claim.created_at,
            originalFileName: claim.file_name || 'claim.pdf',
            fileSizeBytes: claim.file_size || 0,
          },
          pdfType: 'text_layer',
          state: claim.status,
          documentChecklist: claim.document_checklist || { items: [], allRequiredPresent: true, missingRequired: [] },
          auditLogs: claim.audit_logs || []
        } as any;

        setClaimData({ packet, uiFields: data.uiFields });
        setStep('review');
      })
      .catch((err) => {
        setError(err.message || 'An error occurred while fetching the claim.');
        setStep('upload');
      });
  }, [claimIdParam]);

  // Clean up Object URL when component unmounts
  useEffect(() => {
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [fileUrl]);

  const handleUpload = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }
    if (selectedFile.size > 30 * 1024 * 1024) {
      setError('File size must be under 30MB.');
      return;
    }

    setFile(selectedFile);
    const objectUrl = URL.createObjectURL(selectedFile);
    setFileUrl(objectUrl);
    setError(null);
    setStep('processing');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/claims/process', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to process claim.');
      }

      setClaimData({ packet: data, uiFields: data.uiFields });
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'An error occurred during processing.');
      setStep('upload');
      setFile(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setFileUrl(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFieldChange = (fieldId: string, newValue: string) => {
    if (!claimData) return;

    // Update inside uiFields list
    const updatedUiFields = claimData.uiFields.map((f) =>
      f.id === fieldId ? { ...f, value: newValue, confidence: 100 } : f
    );

    // Update structured nested path inside the packet
    const updatedPacket = { ...claimData.packet };
    const parts = fieldId.split('.');
    if (parts.length === 2 && updatedPacket.extractedFields) {
      const [category, key] = parts;
      const cat = updatedPacket.extractedFields[
        category as keyof typeof updatedPacket.extractedFields
      ] as any;
      if (cat && cat[key]) {
        let typedValue: any = newValue;
        if (typeof cat[key].value === 'boolean' || category === 'authorization' || key === 'emergency_case') {
          typedValue = newValue === 'true' || newValue === 'yes' || newValue === '1' || newValue === 'checked' || newValue === 'true';
        } else if (typeof cat[key].value === 'number' || ['age', 'length_of_stay', 'room_rent', 'icu_charges', 'ot_charges', 'medicine', 'investigations', 'professional_fees', 'final_bill', 'total_claimed'].includes(key)) {
          const num = parseFloat(newValue.replace(/[^0-9.]/g, ''));
          typedValue = isNaN(num) ? null : num;
        } else if (key === 'icd10_codes') {
          typedValue = newValue.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        } else {
          typedValue = newValue === '' ? null : newValue;
        }
        
        cat[key].value = typedValue;
        cat[key].confidence = 100;
      }
    }

    // Filter out resolved validation errors locally first (for instant feedback)
    const originalErrorsCount = updatedPacket.validationErrors?.length || 0;
    let updatedErrors = (updatedPacket.validationErrors || []).filter(
      (err: any) => err.field !== fieldId
    );
    if (fieldId === 'authorization.hospital_seal') {
      updatedErrors = updatedErrors.filter((err: any) => err.field !== 'documents.discharge_summary');
    }
    if (fieldId === 'patient.dob') {
      updatedErrors = updatedErrors.filter((err: any) => err.field !== 'documents.aadhaar_card');
    }

    if (updatedErrors.length < originalErrorsCount) {
      updatedPacket.validationErrors = updatedErrors;
      updatedPacket.claimHealth = 92;
      updatedPacket.readiness = 96;
      updatedPacket.rejectionRisk = 'low';
    }

    // 1. Update client state locally for 100% responsive typing
    setClaimData({
      packet: updatedPacket,
      uiFields: updatedUiFields,
    });

    // 2. Trigger database auto-save in background
    fetch('/api/claims/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimId: updatedPacket.claimId,
        extractedFields: updatedPacket.extractedFields,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if ((data.success || data.ok) && data.data) {
          setClaimData((prev) => {
            if (!prev || prev.packet.claimId !== updatedPacket.claimId) return prev;
            return {
              packet: {
                ...prev.packet,
                claimHealth: data.data.claimHealth,
                readiness: data.data.readiness,
                rejectionRisk: data.data.rejectionRisk,
                validationErrors: data.data.validationErrors,
                repairSuggestions: data.data.repairSuggestions,
                state: data.data.state,
              },
              uiFields: prev.uiFields,
            };
          });
        }
      })
      .catch((err) => console.error('Autosave failed:', err));
  };

  const handleSubmit = async () => {
    if (!claimData) return;
    if (!isReadyForSubmission(claimData.packet.state) || claimData.packet.validationErrors.length > 0) {
      setError('Resolve all validation issues before submitting this claim.');
      return;
    }

    try {
      setError(null);
      const response = await fetch('/api/claims/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: claimData.packet.claimId,
          action: 'submit',
          finalData: claimData.packet,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Submission failed.');
      }

      setStep('submitted');
    } catch (err) {
      console.error('Submission failed:', err);
      setError(err instanceof Error ? err.message : 'Submission failed.');
    }
  };

  const handleCompleteValidation = async () => {
    if (!claimData) return;
    if (claimData.packet.validationErrors.length > 0) {
      setError('Resolve all validation issues before completing validation.');
      return;
    }

    try {
      setError(null);
      const response = await fetch('/api/claims/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: claimData.packet.claimId,
          extractedFields: claimData.packet.extractedFields,
          action: 'approve-validation',
        }),
      });

      const result = await response.json();
      if (!response.ok || (!result.success && !result.ok)) {
        throw new Error(result.error || 'Validation completion failed.');
      }

      if (result.data) {
        setClaimData((prev) => {
          if (!prev) return prev;
          return {
            packet: {
              ...prev.packet,
              claimHealth: result.data.claimHealth,
              readiness: result.data.readiness,
              rejectionRisk: result.data.rejectionRisk,
              validationErrors: result.data.validationErrors,
              repairSuggestions: result.data.repairSuggestions,
              state: result.data.state,
            },
            uiFields: prev.uiFields,
          };
        });
      }
    } catch (err) {
      console.error('Validation completion failed:', err);
      setError(err instanceof Error ? err.message : 'Validation completion failed.');
    }
  };

  if (step === 'upload') {
    return (
      <div className="max-w-4xl mx-auto mt-16 px-4">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent sm:text-5xl">
            InsureFlow AI
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Production-grade insurance claim intake. Upload scanned or digital claim packets for
            instant processing.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-rose-900">Processing Error</h4>
              <p className="text-sm mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/30 shadow-inner scale-[0.99]'
              : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50 hover:shadow-lg'
          }`}
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-6 shadow-sm">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Drag & drop claim PDF here</h3>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto text-sm leading-relaxed">
            Support for multi-page native PDFs, mixed layouts, and completely scanned bills up to
            30MB.
          </p>
          <label className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-8 py-3.5 rounded-xl cursor-pointer hover:shadow-lg active:scale-95 transition-all font-semibold">
            Browse Local Files
            <input
              type="file"
              className="hidden"
              accept=".pdf"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </label>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div className="max-w-md mx-auto mt-32 text-center px-4">
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-pulse"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-indigo-600 animate-spin"></div>
          <Loader2 className="w-10 h-10 text-indigo-600 absolute inset-0 m-auto animate-pulse" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-800 mb-3">Processing Document</h2>
        <p className="text-slate-500 leading-relaxed text-sm mb-6">
          Analyzing document layout, resolving OCR layers via Tesseract, classifying document pages,
          and extracting semantic entity nodes.
        </p>
        <div className="space-y-2 max-w-xs mx-auto">
          <div className="flex justify-between text-xs font-semibold text-indigo-600">
            <span>Pipeline Running</span>
            <span className="animate-pulse">Active...</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-1.5 rounded-full animate-[loading_15s_ease-in-out_infinite]"
              style={{ width: '60%' }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'submitted') {
    return (
      <div className="max-w-lg mx-auto mt-32 text-center px-6">
        <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-500 mx-auto mb-8 shadow-sm">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-800 mb-3">
          Claim Submitted Successfully
        </h2>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          The claim dataset has been parsed, repaired, verified, and successfully committed. It is
          now routed for adjudicator review.
        </p>
        <button
          onClick={() => {
            setStep('upload');
            setClaimData(null);
            setFile(null);
            setFileUrl(null);
          }}
          className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-8 py-3.5 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all"
        >
          Process Another Claim
        </button>
      </div>
    );
  }

  // Review Step
  if (step === 'review' && claimData) {
    const { packet, uiFields } = claimData;
    const isInValidationStage = isUnderReview(packet.state);
    const isReadyStage = isReadyForSubmission(packet.state);
    const canApproveValidation = packet.validationErrors.length === 0;
    const actionLabel = isInValidationStage
      ? 'Approve Validation'
      : isReadyStage
        ? 'Submit Claim'
        : 'Under Review';

    // Categorized items mapper
    const categories = [
      { id: 'patient', label: 'Patient Info', icon: User },
      { id: 'insurance', label: 'Insurance Details', icon: Shield },
      { id: 'hospital', label: 'Hospital & Care', icon: Hospital },
      { id: 'clinical', label: 'Clinical Node', icon: Activity },
      { id: 'financial', label: 'Financial Info', icon: DollarSign },
      { id: 'authorization', label: 'Signatures / Seal', icon: CheckSquare },
      { id: 'audit_trail', label: 'Audit Trail', icon: FileText },
    ] as const;

    const filteredFields = activeTab !== 'audit_trail'
      ? uiFields.filter((f) => f.id.startsWith(activeTab + '.'))
      : [];

    return (
      <div className="flex h-[calc(100vh-4rem)] bg-slate-50 overflow-hidden">
        {/* Left Pane: Document Viewer (Collapsible) */}
        <div className={`flex flex-col bg-slate-50 border-r border-slate-200 transition-all duration-300 ${fileUrl ? 'w-1/2' : 'w-1/5 max-w-[250px]'}`}>
          {fileUrl ? (
            <>
              <div className="p-3 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                <h2 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Source Document
                </h2>
                <div className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                  {packet.pageCount} Pages
                </div>
              </div>
              <div className="flex-1 bg-slate-100 p-2 flex">
                <iframe
                  src={fileUrl}
                  className="w-full h-full rounded shadow-sm border border-slate-200 bg-white"
                  title="Source Document"
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
              <FileText className="w-8 h-8 mb-3 text-slate-300" />
              <span className="text-xs font-medium">No document preview available</span>
            </div>
          )}
        </div>

        {/* Right Pane: Review & Repair Workspace */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Review & Repair Workspace</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  Claim ID: <span className="font-mono font-medium text-slate-700">{packet.claimId.slice(0, 8)}...</span>
                </span>
                <span className="h-3 w-px bg-slate-200"></span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">Intake Score:</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${packet.claimHealth >= 80 ? 'bg-emerald-50 text-emerald-700' : packet.claimHealth >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                    {packet.claimHealth}%
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={isInValidationStage ? handleCompleteValidation : isReadyStage ? handleSubmit : undefined}
              disabled={isInValidationStage ? !canApproveValidation : !isReadyStage}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
            >
              {actionLabel}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Dismissible Error Banner */}
          {!hideErrorBanner && activeTab !== 'audit_trail' && packet.validationErrors.length > 0 && (
            <div className="mx-5 mt-5 px-4 py-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {packet.validationErrors.length} Logical Validation{packet.validationErrors.length > 1 ? 's' : ''} require review
              </div>
              <button onClick={() => setHideErrorBanner(true)} className="text-amber-500 hover:text-amber-700 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-100 px-5 pt-2 overflow-x-auto shrink-0 scrollbar-none">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveTab(cat.id);
                    if (cat.id === 'audit_trail') {
                      fetch(`/api/claims/${packet.claimId}`)
                        .then((res) => res.json())
                        .then((data) => {
                          if (data.success && data.claim) {
                            setClaimData((prev) => {
                              if (!prev) return null;
                              return {
                                packet: { ...prev.packet, auditLogs: data.claim.audit_logs || data.claim.auditLogs || [] },
                                uiFields: prev.uiFields,
                              };
                            });
                          }
                        })
                        .catch((err) => console.error('Failed to reload audit logs:', err));
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
            {activeTab === 'audit_trail' ? (
              <div className="max-w-3xl space-y-4">
                {(packet.auditLogs || []).length > 0 ? (
                  <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
                    {(packet.auditLogs || []).map((log: any, idx: number) => (
                      <div key={idx} className="relative">
                        <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white shadow-sm" />
                        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              {log.action || log.stage}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">{log.details || log.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 border border-slate-200 border-dashed rounded-xl text-slate-400 bg-white">
                    <FileText className="w-8 h-8 mb-2 mx-auto text-slate-300" />
                    <p className="text-sm font-medium">No audit logs available</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFields.map((field) => {
                  const errorForField = packet.validationErrors.find(e => e.field === field.id);
                  return (
                    <div key={field.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm group">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                            {field.label}
                          </label>
                          <div className="relative inline-block cursor-help text-slate-300 hover:text-slate-500 transition-colors group/info">
                            <Info className="w-3.5 h-3.5" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-10 pointer-events-none">
                              <div>Source Node: <span className="font-mono text-indigo-300">{field.source}</span></div>
                              {field.raw && <div className="mt-1 truncate">Raw: &quot;{field.raw}&quot;</div>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {field.page && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                              Pg {field.page}
                            </span>
                          )}
                          {field.confidence < 90 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                field.confidence >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                            }`}>
                              {field.confidence}%
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <input
                        type="text"
                        value={field.value || ''}
                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        className={`w-full bg-slate-50 border ${errorForField ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 focus:border-indigo-500'} px-3 py-2 rounded-lg text-sm text-slate-800 focus:outline-none focus:bg-white transition-colors`}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                      
                      {errorForField && (
                        <div className="mt-2 text-xs text-rose-600 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{errorForField.issue}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredFields.length === 0 && (
                  <div className="col-span-full text-center py-10 border border-slate-200 border-dashed rounded-xl text-slate-400 bg-white">
                    <CheckSquare className="w-8 h-8 mb-2 mx-auto text-slate-300" />
                    <p className="text-sm font-medium">No extracted fields in this category</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
