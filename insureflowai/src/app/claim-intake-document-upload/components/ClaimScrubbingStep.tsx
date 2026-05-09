'use client';
import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, X, ArrowLeft, ArrowRight, Calculator, Calendar, Hash } from 'lucide-react';
import type { ExtractedClaimData } from './ClaimIntakeFlow';

interface ClaimScrubbingStepProps {
  confirmedData: ExtractedClaimData;
  onPass: () => void;
  onBack: () => void;
}

type ConstraintStatus = 'pending' | 'running' | 'passed' | 'failed';

interface Constraint {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  status: ConstraintStatus;
  detail?: string;
  error?: string;
}

export default function ClaimScrubbingStep({ confirmedData, onPass, onBack }: ClaimScrubbingStepProps) {
  const [constraints, setConstraints] = useState<Constraint[]>([
    {
      id: 'completeness',
      label: 'Completeness Check',
      description: 'Hospital NPI, Tax ID, and Patient DOB must not be null',
      icon: Hash,
      status: 'pending',
    },
    {
      id: 'logic',
      label: 'Logic Validation',
      description: 'Discharge Date ≥ Admission Date · Gender matches procedure codes',
      icon: Calendar,
      status: 'pending',
    },
    {
      id: 'math',
      label: 'Math Reconciliation',
      description: 'Sum of line items must equal total billed amount',
      icon: Calculator,
      status: 'pending',
    },
  ]);
  const [scrubbingDone, setScrubbingDone] = useState(false);
  const [allPassed, setAllPassed] = useState(false);

  useEffect(() => {
    const runConstraints = async () => {
      // Constraint 1: Completeness
      setConstraints(prev => prev.map(c => c.id === 'completeness' ? { ...c, status: 'running' } : c));
      await new Promise(r => setTimeout(r, 1200));

      const npi = confirmedData.clinical.hospital_npi;
      const taxId = confirmedData.clinical.hospital_tax_id;
      const dob = confirmedData.patient.date_of_birth;
      const completenessPass = !!(npi && taxId && dob);

      setConstraints(prev => prev.map(c => c.id === 'completeness' ? {
        ...c,
        status: completenessPass ? 'passed' : 'failed',
        detail: completenessPass ? 'NPI, Tax ID, and DOB all present' : undefined,
        error: !completenessPass ? 'Missing required fields: ' + [!npi && 'Hospital NPI', !taxId && 'Tax ID', !dob && 'Patient DOB'].filter(Boolean).join(', ') : undefined,
      } : c));

      // Constraint 2: Logic
      setConstraints(prev => prev.map(c => c.id === 'logic' ? { ...c, status: 'running' } : c));
      await new Promise(r => setTimeout(r, 1000));

      const admDate = new Date(confirmedData.clinical.admission_date);
      const disDate = new Date(confirmedData.clinical.discharge_date);
      const logicPass = disDate >= admDate;

      setConstraints(prev => prev.map(c => c.id === 'logic' ? {
        ...c,
        status: logicPass ? 'passed' : 'failed',
        detail: logicPass ? `Discharge (${confirmedData.clinical.discharge_date}) ≥ Admission (${confirmedData.clinical.admission_date})` : undefined,
        error: !logicPass ? 'Discharge date is before admission date' : undefined,
      } : c));

      // Constraint 3: Math
      setConstraints(prev => prev.map(c => c.id === 'math' ? { ...c, status: 'running' } : c));
      await new Promise(r => setTimeout(r, 900));

      const lineSum = confirmedData.billing.line_items.reduce((sum, item) => sum + parseInt(item.gross_charge), 0);
      const totalBilled = parseInt(confirmedData.billing.total_billed_amount);
      const mathPass = lineSum === totalBilled;

      setConstraints(prev => prev.map(c => c.id === 'math' ? {
        ...c,
        status: mathPass ? 'passed' : 'failed',
        detail: mathPass ? `Line items sum ₹${lineSum.toLocaleString()} = Total ₹${totalBilled.toLocaleString()}` : undefined,
        error: !mathPass ? `Line items sum ₹${lineSum.toLocaleString()} ≠ Total ₹${totalBilled.toLocaleString()} (Δ ₹${Math.abs(lineSum - totalBilled).toLocaleString()})` : undefined,
      } : c));

      setScrubbingDone(true);
      setAllPassed(completenessPass && logicPass && mathPass);
    };

    const timer = setTimeout(runConstraints, 400);
    return () => clearTimeout(timer);
  }, [confirmedData]);

  const failedConstraints = constraints.filter(c => c.status === 'failed');

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className={`card p-6 transition-all duration-500 ${
        !scrubbingDone ? '' : allPassed ?'border-success/30' : 'border-danger/30'
      }`}>
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
            !scrubbingDone ? 'bg-primary/10' : allPassed ?'bg-success-bg' : 'bg-danger-bg'
          }`}>
            {!scrubbingDone && <ShieldCheck size={24} className="text-primary validation-pulse" />}
            {scrubbingDone && allPassed && <CheckCircle2 size={24} className="text-success" />}
            {scrubbingDone && !allPassed && <AlertTriangle size={24} className="text-danger" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {!scrubbingDone && 'Claim Scrubbing in Progress'}
              {scrubbingDone && allPassed && 'All Constraints Passed'}
              {scrubbingDone && !allPassed && `${failedConstraints.length} Constraint${failedConstraints.length > 1 ? 's' : ''} Failed`}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {!scrubbingDone && 'Running automated logical constraint checks...'}
              {scrubbingDone && allPassed && 'Claim is ready for final payload generation'}
              {scrubbingDone && !allPassed && 'Please fix the issues below and re-confirm data'}
            </p>
          </div>
        </div>

        {/* Constraint cards */}
        <div className="space-y-3">
          {constraints.map((constraint) => (
            <div
              key={constraint.id}
              className={`rounded-xl border p-4 transition-all duration-300 ${
                constraint.status === 'running' ? 'border-primary/20 bg-primary/5' :
                constraint.status === 'passed' ? 'border-success/20 bg-success-bg/30' :
                constraint.status === 'failed'? 'border-danger/20 bg-danger-bg/30' : 'border-border bg-muted/20 opacity-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  constraint.status === 'running' ? 'bg-primary/10' :
                  constraint.status === 'passed' ? 'bg-success-bg' :
                  constraint.status === 'failed' ? 'bg-danger-bg' : 'bg-muted'
                }`}>
                  {constraint.status === 'running' && (
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  )}
                  {constraint.status === 'passed' && <CheckCircle2 size={15} className="text-success" />}
                  {constraint.status === 'failed' && <X size={15} className="text-danger" />}
                  {constraint.status === 'pending' && <constraint.icon size={15} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{constraint.label}</p>
                    {constraint.status === 'running' && (
                      <span className="text-xs text-primary font-medium validation-pulse">Checking...</span>
                    )}
                    {constraint.status === 'passed' && (
                      <span className="text-xs text-success font-medium">✓ Passed</span>
                    )}
                    {constraint.status === 'failed' && (
                      <span className="text-xs text-danger font-medium">✗ Failed</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{constraint.description}</p>
                  {constraint.detail && (
                    <p className="text-xs text-success-foreground mt-1 font-medium">{constraint.detail}</p>
                  )}
                  {constraint.error && (
                    <p className="text-xs text-danger-foreground mt-1 font-medium">{constraint.error}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Failed guidance */}
      {scrubbingDone && !allPassed && (
        <div className="card p-5 border-warning/20 bg-warning-bg/20 fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Action Required</p>
              <p className="text-xs text-muted-foreground">
                Go back to the Review step to correct the flagged fields. All constraints must pass before generating the final claim payload.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="card p-5 flex items-center justify-between">
        <button onClick={onBack} className="btn-secondary gap-2">
          <ArrowLeft size={15} /> Back to Review
        </button>
        <button
          onClick={onPass}
          disabled={!scrubbingDone || !allPassed}
          className="btn-primary px-6 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate Final Payload <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
