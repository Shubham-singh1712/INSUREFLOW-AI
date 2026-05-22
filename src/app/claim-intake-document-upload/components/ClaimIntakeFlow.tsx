'use client';

import React, { useState, useEffect } from 'react';
import { ClaimPacket, UiClaimField, ClaimState } from '@/lib/claim-processing/types';
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
  RefreshCw,
} from 'lucide-react';

export default function ClaimIntakeFlow() {
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
    'patient' | 'insurance' | 'hospital' | 'clinical' | 'financial' | 'authorization'
  >('patient');

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
      f.id === fieldId ? { ...f, value: newValue } : f
    );

    // Update structured nested path inside the packet
    const updatedPacket = { ...claimData.packet };
    const parts = fieldId.split('.'); // e.g. "patient.full_name" or "authorization.patient_signature"
    if (parts.length === 2 && updatedPacket.extractedFields) {
      const [category, key] = parts;
      const cat = updatedPacket.extractedFields[
        category as keyof typeof updatedPacket.extractedFields
      ] as any;
      if (cat && cat[key]) {
        cat[key].value = newValue;
      }
    }

    setClaimData({
      packet: updatedPacket,
      uiFields: updatedUiFields,
    });
  };

  const handleSubmit = async () => {
    if (!claimData) return;
    setStep('submitted');
    try {
      await fetch('/api/claims/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: claimData.packet.claimId,
          action: 'submit',
          finalData: claimData.packet,
        }),
      });
    } catch (err) {
      console.error('Submission failed:', err);
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

    // Categorized items mapper
    const categories = [
      { id: 'patient', label: 'Patient Info', icon: User },
      { id: 'insurance', label: 'Insurance Details', icon: Shield },
      { id: 'hospital', label: 'Hospital & Care', icon: Hospital },
      { id: 'clinical', label: 'Clinical Node', icon: Activity },
      { id: 'financial', label: 'Financial Info', icon: DollarSign },
      { id: 'authorization', label: 'Signatures / Seal', icon: CheckSquare },
    ] as const;

    const filteredFields = uiFields.filter((f) => f.id.startsWith(activeTab + '.'));

    return (
      <div className="flex h-[calc(100vh-4rem)] bg-slate-50 overflow-hidden">
        {/* Left Pane: Interactive Document Previewer */}
        <div className="w-1/2 flex flex-col bg-white border-r border-slate-200">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Source Packet ({packet.pageCount} pages)
            </h2>
            <div className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Method: {packet.extractionMethod}
            </div>
          </div>
          <div className="flex-1 bg-slate-800 p-2 flex">
            {fileUrl ? (
              <iframe
                src={fileUrl}
                className="w-full h-full rounded-lg shadow-inner bg-slate-900"
                title="Source Document"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border border-slate-700 rounded-lg m-4 border-dashed">
                <AlertTriangle className="w-8 h-8 mb-2" />
                <span className="text-sm">Document preview unavailable</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Extracted Schema Review / Repair Workspace */}
        <div className="w-1/2 flex flex-col overflow-hidden bg-white">
          <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-extrabold text-slate-800">Review & Repair Workspace</h2>
              <div className="flex items-center gap-4 mt-1.5">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  Claim ID:{' '}
                  <span className="font-mono text-slate-700">{packet.claimId.slice(0, 8)}...</span>
                </span>
                <span className="h-3 w-px bg-slate-200"></span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500">Intake Score:</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      packet.claimHealth >= 80
                        ? 'bg-emerald-50 text-emerald-700'
                        : packet.claimHealth >= 50
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {packet.claimHealth}%
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all text-sm"
            >
              Submit Claim
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Category Tabs */}
          <div className="flex border-b border-slate-100 bg-slate-50/30 overflow-x-auto shrink-0 select-none scrollbar-none">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`flex items-center gap-2 px-5 py-4 border-b-2 font-medium text-xs tracking-wide uppercase transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Logic Validation Errors */}
            {packet.validationErrors.length > 0 && (
              <div className="p-4 bg-rose-50/80 border border-rose-100 text-rose-900 rounded-xl shadow-sm">
                <h3 className="font-bold text-sm mb-2 flex items-center gap-2 text-rose-950">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Failed Logical Validations ({packet.validationErrors.length})
                </h3>
                <ul className="space-y-1.5 text-xs text-rose-800 leading-relaxed">
                  {packet.validationErrors.map((err, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="font-bold text-rose-950 shrink-0">•</span>
                      <span>
                        <strong className="font-semibold">{err.field}:</strong> {err.issue}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Editable Form Inputs Grid */}
            <div className="grid grid-cols-1 gap-5">
              {filteredFields.map((field) => (
                <div
                  key={field.id}
                  className="relative p-4 bg-white border border-slate-150 rounded-xl hover:shadow-sm transition-all flex flex-col group"
                >
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {field.label}
                    </label>
                    <div className="flex items-center gap-2">
                      {field.page && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                          Page {field.page}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          field.confidence >= 80
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : field.confidence >= 50
                              ? 'bg-amber-50 text-amber-700 border border-amber-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}
                      >
                        {field.confidence}% Confidence
                      </span>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={field.value || ''}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-inner"
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                  <div className="text-[9px] text-slate-400 mt-1.5 flex justify-between">
                    <span>
                      Source Node: <span className="font-mono">{field.source.toUpperCase()}</span>
                    </span>
                    {field.raw && (
                      <span className="truncate max-w-[70%] italic text-slate-400">
                        Raw match: &quot;{field.raw}&quot;
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {filteredFields.length === 0 && (
                <div className="text-center py-12 border border-dashed rounded-xl text-slate-400 flex flex-col items-center justify-center bg-slate-50/20">
                  <FileCheck2 className="w-10 h-10 mb-2 text-slate-300" />
                  <p className="text-sm font-medium">
                    No extracted fields in this node classification
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
