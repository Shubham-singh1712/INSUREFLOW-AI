'use client';

import React, { useState } from 'react';
import { ClaimPacket, UiClaimField, ClaimState } from '@/lib/claim-processing/types';
import { UploadCloud, CheckCircle, AlertTriangle, FileText, Loader2 } from 'lucide-react';

export default function ClaimIntakeFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [step, setStep] = useState<'upload' | 'processing' | 'review' | 'submitted'>('upload');
  const [claimData, setClaimData] = useState<{ packet: ClaimPacket; uiFields: UiClaimField[] } | null>(null);

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
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
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
      console.error(err);
    }
  };

  if (step === 'upload') {
    return (
      <div className="max-w-3xl mx-auto mt-12">
        <h1 className="text-3xl font-bold mb-6">Upload Insurance Claim</h1>
        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
          }`}
        >
          <UploadCloud className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Drag & drop claim PDF here</h3>
          <p className="text-muted-foreground mb-6">Support for multi-page scanned or native PDFs up to 30MB.</p>
          <label className="bg-primary text-primary-foreground px-6 py-3 rounded-md cursor-pointer hover:bg-primary/90 font-medium">
            Browse Files
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
      <div className="max-w-xl mx-auto mt-24 text-center">
        <Loader2 className="w-16 h-16 animate-spin mx-auto text-primary mb-6" />
        <h2 className="text-2xl font-semibold mb-2">Processing Claim Packet...</h2>
        <p className="text-muted-foreground">Running OCR, classifying pages, and extracting entities.</p>
      </div>
    );
  }

  if (step === 'submitted') {
    return (
      <div className="max-w-xl mx-auto mt-24 text-center">
        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-6" />
        <h2 className="text-2xl font-semibold mb-2">Claim Submitted Successfully</h2>
        <p className="text-muted-foreground mb-8">The claim has been pushed to the processing queue.</p>
        <button
          onClick={() => { setStep('upload'); setClaimData(null); setFile(null); }}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium"
        >
          Process Another Claim
        </button>
      </div>
    );
  }

  // Review Step
  if (step === 'review' && claimData) {
    const { packet, uiFields } = claimData;
    return (
      <div className="flex h-[calc(100vh-4rem)] bg-background">
        {/* Left Pane: PDF Viewer placeholder */}
        <div className="w-1/2 border-r flex flex-col">
          <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Source Document ({packet.pageCount} pages)
            </h2>
            <div className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">
              {packet.extractionMethod.toUpperCase()}
            </div>
          </div>
          <div className="flex-1 bg-muted/10 flex items-center justify-center p-8 text-center text-muted-foreground border-2 border-dashed m-4 rounded-lg">
            [ PDF Viewer Component goes here ]<br/>
            (Original PDF file is stored in browser memory)
          </div>
        </div>

        {/* Right Pane: Extracted Data Review */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex justify-between items-center shrink-0">
            <div>
              <h2 className="font-semibold">Review & Repair Data</h2>
              <p className="text-sm text-muted-foreground">Claim Health: {packet.claimHealth}%</p>
            </div>
            <button
              onClick={handleSubmit}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium"
            >
              Submit Claim
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Validation Errors */}
            {packet.validationErrors.length > 0 && (
              <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-100">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Validation Issues ({packet.validationErrors.length})
                </h3>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {packet.validationErrors.map((err, idx) => (
                    <li key={idx}>
                      <span className="font-medium">{err.field}:</span> {err.issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fields Grid */}
            <div className="grid grid-cols-2 gap-4">
              {uiFields.map((field) => (
                <div key={field.id} className="p-3 bg-card border rounded-lg shadow-sm">
                  <div className="flex justify-between items-start mb-1">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {field.label}
                    </label>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${
                      field.confidence >= 80 ? 'bg-green-100 text-green-700' :
                      field.confidence >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {field.confidence}%
                    </span>
                  </div>
                  <input
                    type="text"
                    defaultValue={field.value}
                    className="w-full bg-transparent font-medium focus:outline-none focus:border-b focus:border-primary"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1 text-right">
                    {field.source}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
