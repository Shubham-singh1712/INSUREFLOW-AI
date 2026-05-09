'use client';
import React, { useState } from 'react';
import {
  CheckCircle2, FileText, User, CreditCard, ShieldCheck,
  AlertTriangle, ArrowRight, Download, Send, Zap, Clock,
} from 'lucide-react';
import Link from 'next/link';

interface ClaimConfirmationProps {
  claimId: string;
  patientData: Record<string, string>;
  uploadedDocs: Record<string, { name: string; size: string; status: string }>;
}

export default function ClaimConfirmation({ claimId, patientData, uploadedDocs }: ClaimConfirmationProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    // TODO: Backend integration — POST /api/claims/submit with { claimId, patientData, documents }
    await new Promise(r => setTimeout(r, 1800));
    setSubmitting(false);
    setSubmitted(true);
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
          Claim <span className="font-bold text-foreground font-tabular">{claimId}</span> has been submitted to the TPA queue.
        </p>
        <p className="text-xs text-muted-foreground mb-8">
          You will receive a confirmation once the TPA processes the claim. Average processing time: 3–5 business days.
        </p>
        <div className="grid grid-cols-3 gap-4 mb-8 text-left">
          {[
            { label: 'Claim ID', value: claimId },
            { label: 'Submission Score', value: '62/100' },
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
            <Download size={15} /> Download Master PDF
          </button>
          <Link href="/main-dashboard" className="btn-primary gap-2">
            Back to Dashboard <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  const docCount = Object.keys(uploadedDocs).length || 3;
  const passedDocs = Object.values(uploadedDocs).filter(d => d.status === 'passed').length || 2;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning-bg flex items-center justify-center">
              <AlertTriangle size={18} className="text-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Claim Ready for Review</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                3 open issues · Submission readiness score: <span className="font-semibold text-warning-foreground">62/100</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge-warning">
              <Clock size={10} /> Repairs Pending
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient summary */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={15} className="text-muted-foreground" />
            <h4 className="font-semibold text-sm text-foreground">Patient Details</h4>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Name', value: patientData.patientName || 'Ramesh Kumar Iyer' },
              { label: 'DOB', value: patientData.dateOfBirth || '03/14/1958' },
              { label: 'Hospital', value: patientData.hospitalName || 'Apollo Hospitals, Greams Rd' },
              { label: 'Admission', value: patientData.admissionDate || '05/01/2026' },
              { label: 'Discharge', value: patientData.dischargeDate || '05/06/2026' },
              { label: 'Physician', value: patientData.attendingPhysician || 'Dr. Suresh Babu' },
              { label: 'Diagnosis', value: patientData.diagnosisCode || 'I21.0 — Acute MI' },
            ].map((item) => (
              <div key={`ps-${item.label}`} className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground shrink-0">{item.label}</span>
                <span className="text-xs font-medium text-foreground text-right truncate max-w-[160px]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Insurance summary */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={15} className="text-muted-foreground" />
            <h4 className="font-semibold text-sm text-foreground">Insurance Details</h4>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'TPA', value: patientData.tpaName || 'Apollo Munich' },
              { label: 'Policy No.', value: patientData.policyNumber || 'APMH-2024-0048271' },
              { label: 'Card No.', value: patientData.insuranceCardNumber || 'IC-7748291034' },
              { label: 'Pre-Auth', value: patientData.preAuthNumber || 'PA-2026-00847' },
              { label: 'Claim Type', value: patientData.claimType || 'Cashless' },
              { label: 'Est. Amount', value: patientData.estimatedAmount ? `₹${patientData.estimatedAmount}` : '₹1,84,500' },
            ].map((item) => (
              <div key={`ins-${item.label}`} className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground shrink-0">{item.label}</span>
                <span className="text-xs font-medium text-foreground text-right font-tabular">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Documents & validation */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={15} className="text-muted-foreground" />
            <h4 className="font-semibold text-sm text-foreground">Documents & Validation</h4>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Discharge Summary', status: 'warning' },
              { label: 'Insurance Card', status: 'passed' },
              { label: 'Lab Reports', status: 'warning' },
              { label: 'Patient ID', status: 'passed' },
              { label: 'Hospital Invoice', status: 'passed' },
            ].map((doc) => (
              <div key={`doc-confirm-${doc.label}`} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  doc.status === 'passed' ? 'bg-success' : 'bg-warning'
                }`} />
                <span className="text-xs text-foreground flex-1">{doc.label}</span>
                <span className={`text-xs font-medium ${
                  doc.status === 'passed' ? 'text-success-foreground' : 'text-warning-foreground'
                }`}>
                  {doc.status === 'passed' ? 'Verified' : 'Review'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">AI Confidence</span>
              <span className="text-sm font-bold text-warning-foreground font-tabular">81%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
              <div className="h-full w-[81%] bg-warning rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="card p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-info-bg flex items-center justify-center">
            <ShieldCheck size={16} className="text-info" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Proceed with open issues?</p>
            <p className="text-xs text-muted-foreground">
              Submitting with unresolved repairs may increase rejection risk. Consider applying AI suggestions first.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button className="btn-secondary gap-2">
            <Download size={15} /> Save as Draft
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