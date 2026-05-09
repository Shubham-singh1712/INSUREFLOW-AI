'use client';
import React, { useState } from 'react';
import {
  FileText, Download, Send, CheckCircle2, Zap, ArrowRight,
  ShieldCheck, Code2, BookOpen, Clock,
} from 'lucide-react';
import Link from 'next/link';
import type { ExtractedClaimData } from './ClaimIntakeFlow';

interface FinalSubmissionStepProps {
  claimId: string;
  confirmedData: ExtractedClaimData | null;
}

const ub04Fields = [
  { box: '1', label: 'Provider Name', value: 'Apollo Hospitals, Greams Road, Chennai' },
  { box: '3a', label: 'Patient Control No.', value: 'CLM-2852' },
  { box: '4', label: 'Type of Bill', value: '111 — Inpatient Hospital' },
  { box: '6', label: 'Statement Covers Period', value: '05/01/2026 – 05/06/2026' },
  { box: '8', label: 'Patient Name', value: 'Iyer, Ramesh Kumar' },
  { box: '10', label: 'Patient DOB', value: '03/14/1958' },
  { box: '11', label: 'Patient Sex', value: 'M' },
  { box: '38', label: 'Responsible Party', value: 'Apollo Munich Health Insurance' },
  { box: '56', label: 'NPI', value: '1234567890' },
  { box: '67', label: 'Principal Diagnosis', value: 'I21.0' },
  { box: '74', label: 'Principal Procedure', value: '92928' },
  { box: '86', label: 'Attending Physician NPI', value: '9876543210' },
];

const ediPayloadPreview = `{
  "transaction_set": "837I",
  "version": "005010X223A2",
  "interchange_control": {
    "sender_id": "APOLLO_HOSP",
    "receiver_id": "APMH_PAYER_001",
    "date": "2026-05-08"
  },
  "claim": {
    "patient_control_number": "CLM-2852",
    "total_claim_charge": 184500.00,
    "facility_type": "11",
    "claim_frequency": "1",
    "principal_diagnosis": "I21.0",
    "procedure_codes": ["92928", "93510"],
    "service_lines": [
      { "revenue_code": "0200", "description": "ICU Charges", "charge": 60000.00 },
      { "revenue_code": "0360", "description": "Angioplasty Procedure", "charge": 85000.00 },
      { "revenue_code": "0278", "description": "Stent (Drug Eluting)", "charge": 28000.00 },
      { "revenue_code": "0250", "description": "Pharmacy & Consumables", "charge": 11500.00 }
    ]
  }
}`;

export default function FinalSubmissionStep({ claimId, confirmedData }: FinalSubmissionStepProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'ub04' | 'edi'>('ub04');

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/claims/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, confirmedData }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Submission failed');
      }

      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="card p-12 text-center max-w-2xl mx-auto fade-in">
        <div className="w-20 h-20 rounded-full bg-success-bg flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={36} className="text-success" />
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success-bg border border-success/20 mb-4">
          <Zap size={13} className="text-success" />
          <span className="text-sm font-semibold text-success-foreground">AI Verified & Submitted</span>
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Claim Submitted Successfully</h2>
        <p className="text-muted-foreground text-sm mb-2">
          Claim <span className="font-bold text-foreground font-tabular">{claimId}</span> has been submitted to the TPA queue via EDI 837I.
        </p>
        <p className="text-xs text-muted-foreground mb-8">
          UB-04 form and EDI payload generated. Average TPA processing time: 3–5 business days.
        </p>
        <div className="grid grid-cols-3 gap-4 mb-8 text-left">
          {[
            { label: 'Claim ID', value: claimId },
            { label: 'Format', value: 'UB-04 + EDI 837I' },
            { label: 'Status', value: 'Submitted to Queue' },
          ].map((item) => (
            <div key={`confirm-${item.label}`} className="bg-muted rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
              <p className="text-sm font-semibold text-foreground font-tabular">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button className="btn-secondary gap-2">
            <Download size={15} /> Download UB-04 PDF
          </button>
          <Link href="/main-dashboard" className="btn-primary gap-2">
            Back to Dashboard <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card p-5 border-success/20 bg-success-bg/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-success-bg flex items-center justify-center">
            <ShieldCheck size={22} className="text-success" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-foreground">Claim Validated — Ready for Submission</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              All constraints passed. Final payload formatted as UB-04 (CMS-1450) and EDI 837I.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge-success">
              <CheckCircle2 size={10} /> All Checks Passed
            </span>
          </div>
        </div>
      </div>

      {/* Payload tabs */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('ub04')}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'ub04' ?'text-primary border-b-2 border-primary bg-primary/5' :'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen size={14} /> UB-04 / CMS-1450 Form
          </button>
          <button
            onClick={() => setActiveTab('edi')}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'edi' ?'text-primary border-b-2 border-primary bg-primary/5' :'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Code2 size={14} /> EDI 837I JSON Payload
          </button>
        </div>

        <div className="p-5">
          {activeTab === 'ub04' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">UB-04 Institutional Claim Form</p>
                  <p className="text-xs text-muted-foreground">CMS-1450 standard layout — Claim ID {claimId}</p>
                </div>
                <button className="btn-secondary gap-2 text-xs py-1.5 px-3">
                  <Download size={13} /> Download PDF
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ub04Fields.map((field) => (
                  <div key={`ub04-${field.box}`} className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                    <span className="text-xs font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-tabular shrink-0">
                      Box {field.box}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{field.label}</p>
                      <p className="text-xs font-semibold text-foreground font-tabular truncate">{field.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'edi' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">EDI 837I JSON Payload</p>
                  <p className="text-xs text-muted-foreground">ANSI X12 005010X223A2 standard · Ready for API transmission</p>
                </div>
                <button className="btn-secondary gap-2 text-xs py-1.5 px-3">
                  <Download size={13} /> Download JSON
                </button>
              </div>
              <pre className="bg-muted/60 rounded-xl p-4 text-xs text-foreground font-mono overflow-x-auto leading-relaxed border border-border">
                {ediPayloadPreview}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Submission checklist */}
      <div className="card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Submission Readiness Checklist</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            'Patient demographics verified',
            'Insurance policy validated',
            'Pre-authorization code present',
            'ICD-10 codes extracted',
            'CPT/HCPCS codes mapped',
            'Billing line items reconciled',
            'Hospital NPI confirmed',
            'Completeness constraints passed',
            'Logic constraints passed',
            'Math constraints passed',
            'UB-04 form generated',
            'EDI 837I payload ready',
          ].map((item) => (
            <div key={`check-${item}`} className="flex items-center gap-2.5 py-1.5">
              <CheckCircle2 size={14} className="text-success shrink-0" />
              <span className="text-xs text-foreground">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action bar */}
      <div className="card p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-info-bg flex items-center justify-center">
            <Clock size={16} className="text-info" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Ready to submit to TPA queue</p>
            <p className="text-xs text-muted-foreground">
              Claim <span className="font-tabular font-bold">{claimId}</span> · ₹1,84,500 · Apollo Munich
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button className="btn-secondary gap-2">
            <FileText size={15} /> Save as Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary px-6 gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send size={15} /> Submit to TPA Queue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
