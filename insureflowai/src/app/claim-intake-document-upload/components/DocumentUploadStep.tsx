'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileCheck2,
  FileSearch,
  Layers3,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import type { UploadedDoc } from './ClaimIntakeFlow';

interface DocumentUploadStepProps {
  onNext: (docs: Record<string, UploadedDoc>) => void;
}

const packetStates = [
  { label: 'Detect documents', icon: FileSearch },
  { label: 'Split packet pages', icon: Layers3 },
  { label: 'Run OCR extraction', icon: ScanLine },
  { label: 'Validate compliance', icon: ShieldCheck },
  { label: 'Suggest repairs', icon: Wand2 },
];

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export default function DocumentUploadStep({ onNext }: DocumentUploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [packet, setPacket] = useState<UploadedDoc | null>(null);

  const uploaded = packet?.status === 'passed' || packet?.status === 'warning';
  const activeStateIndex = useMemo(() => {
    if (!packet) return -1;
    if (uploaded) return packetStates.length;
    return Math.min(Math.floor(packet.progress / 20), packetStates.length - 1);
  }, [packet, uploaded]);

  const syncUploadWithApi = async (file: File) => {
    const formData = new FormData();
    formData.append('documentType', 'claim_packet');
    formData.append('file', file);

    try {
      await fetch('/api/claims/uploads', {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      throw error instanceof Error ? error : new Error('Upload endpoint failed.');
    }
  };

  const handlePacket = useCallback((file?: File) => {
    const selectedFile = file || null;
    if (!selectedFile) return;

    const uploadedPacket: UploadedDoc = {
      name: selectedFile.name,
      size: formatFileSize(selectedFile.size),
      status: 'processing',
      progress: 8,
      documentType: 'claim_packet',
      mimeType: selectedFile.type || 'application/pdf',
      message: 'AI is preparing the claim packet...',
    };

    setPacket(uploadedPacket);
    void syncUploadWithApi(selectedFile).catch((error) => {
      setPacket((current) =>
        current
          ? {
              ...current,
              status: 'failed',
              progress: 100,
              message: error instanceof Error ? error.message : 'Upload endpoint failed.',
            }
          : current
      );
    });
    readFileAsDataUrl(selectedFile)
      .then((dataUrl) => setPacket((current) => (current ? { ...current, dataUrl } : current)))
      .catch(() => undefined);

    let progress = 8;
    const timer = window.setInterval(() => {
      progress = Math.min(progress + 9 + Math.floor(Math.random() * 8), 100);
      setPacket((current) =>
        current && current.status !== 'failed'
          ? {
              ...current,
              progress,
              status: progress >= 100 ? 'passed' : 'processing',
              message:
                progress >= 100
                  ? 'Packet ready for AI classification and validation'
                  : 'AI is scanning and structuring the claim packet...',
            }
          : current
      );
      if (progress >= 100) window.clearInterval(timer);
    }, 260);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      handlePacket(event.dataTransfer.files?.[0]);
    },
    [handlePacket]
  );

  const continueWithPacket = () => {
    if (!packet) return;
    onNext({
      claim_packet: {
        ...packet,
        status: uploaded ? packet.status : 'passed',
        progress: 100,
        message: 'Single packet uploaded for intelligent processing',
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="relative p-6 lg:p-8 bg-gradient-to-br from-white via-blue-50/40 to-cyan-50/30">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-info to-success" />
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            <div className="xl:col-span-7">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="badge-info">
                  <Sparkles size={12} /> Single upload
                </span>
                <span className="badge-success">AI classification</span>
                <span className="badge-muted">No manual categorization</span>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Upload one messy claim packet.</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-6">
                Add one PDF containing discharge summary, insurance card, prescriptions, invoices,
                reports, IDs and claim forms. InsureFlow AI will split, classify, extract, validate
                and prepare repairs automatically.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                {[
                  ['1', 'PDF packet'],
                  ['12', 'Pages detected'],
                  ['93%', 'OCR confidence'],
                  ['2', 'Likely repairs'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-xl border border-border bg-white/70 p-4">
                    <p className="text-2xl font-bold text-foreground font-tabular">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="xl:col-span-5">
              <div
                className={`relative min-h-[280px] rounded-2xl border-2 border-dashed p-5 transition-all duration-200 ${
                  dragActive
                    ? 'border-primary bg-primary/5 shadow-card-md'
                    : 'border-primary/25 bg-white/80 hover:border-primary/40'
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                {packet?.status === 'processing' && (
                  <div className="absolute inset-x-6 top-7 h-px bg-primary ai-scan-line" />
                )}
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    {packet ? (
                      <FileCheck2 size={28} className="text-primary" />
                    ) : (
                      <Upload size={28} className="text-primary" />
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {packet ? packet.name : 'Drop one combined PDF packet'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {packet ? `${packet.size} - ${packet.message}` : 'PDF only - up to 100MB'}
                  </p>
                  {packet && (
                    <div className="w-full mt-5">
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary via-info to-success transition-all duration-300"
                          style={{ width: `${packet.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 font-tabular">
                        {packet.progress}% processed
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-center gap-2 mt-5">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={15} /> Choose PDF
                    </button>
                    {packet && (
                      <button type="button" className="btn-ghost" onClick={() => setPacket(null)}>
                        <X size={14} /> Clear
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(event) => handlePacket(event.target.files?.[0])}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {packetStates.map((state, index) => {
          const Icon = state.icon;
          const done = uploaded || index < activeStateIndex;
          const active = packet?.status === 'processing' && index === activeStateIndex;

          return (
            <div
              key={state.label}
              className={`card p-4 transition-all ${
                active ? 'border-primary/30 bg-primary/5' : done ? 'border-success/20' : ''
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
                  done ? 'bg-success-bg' : active ? 'bg-primary/10' : 'bg-muted'
                }`}
              >
                {done ? (
                  <CheckCircle2 size={16} className="text-success" />
                ) : active ? (
                  <Bot size={16} className="text-primary validation-pulse" />
                ) : (
                  <Icon size={16} className="text-muted-foreground" />
                )}
              </div>
              <p className="text-sm font-semibold text-foreground">{state.label}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {done ? 'Complete' : active ? 'Running now' : 'Queued'}
              </p>
            </div>
          );
        })}
      </div>

      <div className="card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {uploaded
              ? 'Packet ready - continue into AI classification, extraction and validation'
              : 'Upload one PDF packet to start intelligent processing'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            The intake team no longer has to sort documents one by one.
          </p>
        </div>
        <button
          type="button"
          onClick={continueWithPacket}
          disabled={!packet || packet.status === 'failed'}
          className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue AI Processing <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
