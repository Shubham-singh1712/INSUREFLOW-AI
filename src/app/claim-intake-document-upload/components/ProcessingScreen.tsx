'use client';

import React, { useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  RefreshCw,
  FileSearch,
  Layers3,
  Fingerprint,
  ScanLine,
  PenLine,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Wand2,
  FileText,
  Sparkles,
} from 'lucide-react';
import { Packet } from './ClaimIntakeFlow';

interface ProcessingScreenProps {
  packet: Packet;
  progress: number;
}

const steps = [
  {
    id: 'detect',
    label: 'Detecting documents',
    detail: 'AI locating document boundaries across the packet',
    icon: FileSearch,
  },
  {
    id: 'split',
    label: 'Splitting pages',
    detail: 'Pages grouped by document type and context signals',
    icon: Layers3,
  },
  {
    id: 'patient',
    label: 'Extracting patient details',
    detail: 'Names, identifiers, demographics and payer data mapped',
    icon: Fingerprint,
  },
  {
    id: 'prescriptions',
    label: 'Reading prescriptions',
    detail: 'Clinical orders, medicines and supporting notes parsed',
    icon: ScanLine,
  },
  {
    id: 'signatures',
    label: 'Identifying signatures',
    detail: 'Signature blocks, stamps and authorization marks checked',
    icon: PenLine,
  },
  {
    id: 'ocr',
    label: 'Running OCR',
    detail: 'Low-contrast scans enhanced before extraction',
    icon: Eye,
  },
  {
    id: 'compliance',
    label: 'Validating compliance',
    detail: 'TPA rules and required claim evidence evaluated',
    icon: ShieldCheck,
  },
  {
    id: 'missing',
    label: 'Detecting missing info',
    detail: 'AI scanning for gaps that can trigger rejection',
    icon: ShieldAlert,
  },
  {
    id: 'repair',
    label: 'Generating repair suggestions',
    detail: 'Actionable fixes prepared for the intake team',
    icon: Wand2,
  },
];

const aiMessages = [
  'Reading document structure...',
  'Analyzing page boundaries...',
  'Extracting patient demographics...',
  'Cross-referencing insurance data...',
  'Running handwriting recognition...',
  'Checking signature validity...',
  'Mapping ICD-10 codes...',
  'Calculating invoice totals...',
  'Evaluating compliance rules...',
  'Generating validation report...',
];

export default function ProcessingScreen({ packet, progress }: ProcessingScreenProps) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % aiMessages.length), 1800);
    return () => clearInterval(t);
  }, []);

  const activeStep = Math.min(Math.floor(progress / (100 / steps.length)), steps.length - 1);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-8 space-y-8">
      {/* Central AI orb */}
      <div className="relative flex items-center justify-center">
        {/* Outer pulse rings */}
        <div
          className="absolute w-48 h-48 rounded-full border border-primary/20 animate-ping"
          style={{ animationDuration: '2s' }}
        />
        <div
          className="absolute w-36 h-36 rounded-full border border-primary/30 animate-ping"
          style={{ animationDuration: '2.5s', animationDelay: '0.3s' }}
        />
        {/* Glow */}
        <div className="absolute w-32 h-32 rounded-full bg-primary/10 blur-2xl" />
        {/* Core */}
        <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-primary/20 to-info/20 border-2 border-primary/40 flex items-center justify-center shadow-[0_0_40px_rgba(37,99,235,0.25)]">
          <Bot size={44} className="text-primary validation-pulse" />
        </div>
      </div>

      {/* Live message */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-foreground">AI Processing Your Claim Packet</h2>
        <div className="flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary validation-pulse" />
          <p className="text-sm text-primary font-medium min-h-[20px] transition-all duration-300">
            {aiMessages[msgIdx]}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {packet.name} · {packet.size} · {packet.pages} pages
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xl space-y-2">
        <div className="flex justify-between text-xs font-semibold">
          <span className="text-muted-foreground">Automation progress</span>
          <span className="text-foreground font-tabular">{progress}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-info to-success transition-all duration-500 relative overflow-hidden"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent ai-scan-line" />
          </div>
        </div>
      </div>

      {/* Steps grid */}
      <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map((step, i) => {
          const done = i < activeStep;
          const active = i === activeStep;
          const Icon = step.icon;
          return (
            <div
              key={step.id}
              className={`
                rounded-2xl border p-4 transition-all duration-500
                ${active ? 'border-primary/30 bg-primary/5 shadow-[0_0_20px_rgba(37,99,235,0.1)]' : ''}
                ${done ? 'border-success/20 bg-success-bg/40' : ''}
                ${!active && !done ? 'border-border bg-muted/20 opacity-50' : ''}
              `}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${done ? 'bg-success-bg' : active ? 'bg-primary/10' : 'bg-muted'}`}
                >
                  {done ? (
                    <CheckCircle2 size={16} className="text-success" />
                  ) : active ? (
                    <RefreshCw size={16} className="text-primary animate-spin" />
                  ) : (
                    <Icon size={16} className="text-muted-foreground" />
                  )}
                </div>
                <p
                  className={`text-xs font-semibold leading-tight ${active ? 'text-primary' : done ? 'text-success-foreground' : 'text-muted-foreground'}`}
                >
                  {step.label}
                </p>
              </div>
              {(active || done) && (
                <p className="text-xs text-muted-foreground leading-4 pl-11">{step.detail}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles size={12} className="text-primary" />
        <span>InsureFlow AI is processing all {packet.pages} pages simultaneously</span>
        <FileText size={12} />
      </div>
    </div>
  );
}
