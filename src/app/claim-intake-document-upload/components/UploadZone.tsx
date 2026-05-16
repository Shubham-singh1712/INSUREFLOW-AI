'use client';

import React, { useRef, useState } from 'react';
import {
  Upload, Sparkles, FileText, ShieldCheck, Brain,
  ScanLine, Fingerprint, Layers3, ArrowRight,
} from 'lucide-react';

interface UploadZoneProps {
  claimId: string;
  onUpload: (file: File) => void;
}

const capabilities = [
  { icon: Brain, label: 'Auto-classifies every page' },
  { icon: Fingerprint, label: 'Extracts patient & payer data' },
  { icon: ScanLine, label: 'OCR + signature detection' },
  { icon: ShieldCheck, label: 'Compliance validation' },
  { icon: Layers3, label: 'Generates indexed PDF packet' },
];

const acceptedDocs = [
  'Discharge Summary', 'Insurance Card', 'Lab Reports',
  'Invoices', 'Prescriptions', 'IDs & Forms',
];

export default function UploadZone({ claimId, onUpload }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="badge-info"><Sparkles size={11} /> AI-first intake</span>
            <span className="badge-success">Automation enabled</span>
            <span className="badge-muted font-tabular">{claimId}</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground leading-tight">
            Upload one claim packet.<br />
            <span className="text-primary">AI organizes the rest.</span>
          </h1>
          <p className="text-muted-foreground mt-3 text-sm max-w-xl leading-relaxed">
            Drop a single PDF containing any mix of documents. InsureFlow AI reads, classifies,
            extracts, validates and prepares a submission-ready claim — automatically.
          </p>
        </div>
        <div className="hidden xl:flex flex-col items-end gap-2 shrink-0">
          {capabilities.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon size={13} className="text-primary" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`
          relative rounded-3xl border-2 border-dashed transition-all duration-300 overflow-hidden
          ${dragActive
            ? 'border-primary bg-primary/5 shadow-[0_0_40px_rgba(37,99,235,0.15)]'
            : 'border-primary/25 bg-gradient-to-br from-white via-blue-50/30 to-cyan-50/20 hover:border-primary/50 hover:shadow-card-md'
          }
        `}
        style={{ minHeight: 360 }}
      >
        {/* Animated grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* AI glow pulse */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-center justify-center text-center py-16 px-8 gap-6">
          {/* Icon */}
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-card-md">
              <Upload size={36} className="text-primary" />
            </div>
            <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-success flex items-center justify-center">
              <Sparkles size={12} className="text-white" />
            </span>
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground">Drop your combined claim packet here</h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              One PDF with everything inside — no sorting, no manual categories
            </p>
          </div>

          {/* Accepted doc chips */}
          <div className="flex flex-wrap justify-center gap-2">
            {acceptedDocs.map((doc) => (
              <span key={doc} className="flex items-center gap-1.5 text-xs bg-white border border-border rounded-full px-3 py-1 text-muted-foreground shadow-sm">
                <FileText size={11} className="text-primary" /> {doc}
              </span>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary px-6 py-3 text-base rounded-2xl shadow-card-md"
            >
              <Upload size={17} /> Choose PDF packet
            </button>
          </div>

          <p className="text-xs text-muted-foreground">PDF only · Max 50 MB · All pages processed automatically</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
        />
      </div>

      {/* How it works strip */}
      <div className="card p-5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">How InsureFlow AI processes your packet</p>
        <div className="flex flex-wrap gap-0">
          {[
            'Upload one PDF',
            'AI detects & classifies pages',
            'OCR + data extraction',
            'Compliance validation',
            'Issues detected & fixed',
            'Submission-ready packet',
          ].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-xs font-medium text-foreground">{step}</span>
              </div>
              {i < arr.length - 1 && (
                <ArrowRight size={13} className="text-muted-foreground/50 mx-1 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
