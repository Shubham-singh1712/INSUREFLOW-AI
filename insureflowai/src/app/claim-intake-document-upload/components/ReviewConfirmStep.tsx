'use client';
import React, { useState } from 'react';
import { User, CreditCard, Stethoscope, Receipt, AlertTriangle, CheckCircle2, ArrowLeft, ArrowRight, Edit3 } from 'lucide-react';
import type { ExtractedClaimData } from './ClaimIntakeFlow';

interface ReviewConfirmStepProps {
  extractedData: ExtractedClaimData;
  onConfirm: (data: ExtractedClaimData) => void;
  onBack: () => void;
}

export default function ReviewConfirmStep({ extractedData, onConfirm, onBack }: ReviewConfirmStepProps) {
  const [data, setData] = useState<ExtractedClaimData>(extractedData);

  const updateField = (section: keyof ExtractedClaimData, field: string, value: string) => {
    setData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as Record<string, unknown>),
        [field]: value,
      },
    }));
  };

  const isLowConfidence = (fieldPath: string) =>
    data.extraction_meta.low_confidence_fields.includes(fieldPath);

  const FieldRow = ({
    label,
    value,
    fieldPath,
    section,
    field,
    editable = true,
  }: {
    label: string;
    value: string;
    fieldPath: string;
    section: keyof ExtractedClaimData;
    field: string;
    editable?: boolean;
  }) => {
    const [editing, setEditing] = useState(false);
    const [localVal, setLocalVal] = useState(value);
    const low = isLowConfidence(fieldPath);

    return (
      <div className={`flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0 ${
        low ? 'bg-warning-bg/20 -mx-2 px-2 rounded-lg' : ''
      }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            {low && (
              <span className="flex items-center gap-1 text-xs text-warning-foreground font-medium">
                <AlertTriangle size={10} /> Low confidence — review
              </span>
            )}
          </div>
          {editing ? (
            <input
              autoFocus
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              onBlur={() => {
                updateField(section, field, localVal);
                setEditing(false);
              }}
              className="input-field text-xs py-1.5 h-auto"
            />
          ) : (
            <p className={`text-sm font-medium font-tabular ${low ? 'text-warning-foreground' : 'text-foreground'}`}>
              {value || <span className="text-muted-foreground italic">Not detected</span>}
            </p>
          )}
        </div>
        {editable && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center shrink-0 mt-1"
          >
            <Edit3 size={12} className="text-muted-foreground" />
          </button>
        )}
      </div>
    );
  };

  const lowCount = data.extraction_meta.low_confidence_fields.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={`card p-5 flex items-center gap-4 ${lowCount > 0 ? 'border-warning/30' : 'border-success/30'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          lowCount > 0 ? 'bg-warning-bg' : 'bg-success-bg'
        }`}>
          {lowCount > 0
            ? <AlertTriangle size={18} className="text-warning" />
            : <CheckCircle2 size={18} className="text-success" />
          }
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            {lowCount > 0
              ? `${lowCount} field${lowCount > 1 ? 's' : ''} flagged for manual review`
              : 'All fields extracted with high confidence'
            }
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review pre-populated data below. Edit any incorrect values before confirming.
          </p>
        </div>
        <span className="text-2xl font-bold font-tabular text-success-foreground">
          {data.extraction_meta.overall_confidence}%
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Patient Demographics */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <div className="w-7 h-7 rounded-lg bg-info-bg flex items-center justify-center">
              <User size={13} className="text-info" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Patient Demographics</h4>
            <span className="badge-info ml-auto text-xs">Intake Form</span>
          </div>
          <FieldRow label="Full Name" value={data.patient.full_name} fieldPath="patient.full_name" section="patient" field="full_name" />
          <FieldRow label="Date of Birth" value={data.patient.date_of_birth} fieldPath="patient.date_of_birth" section="patient" field="date_of_birth" />
          <FieldRow label="Gender" value={data.patient.gender} fieldPath="patient.gender" section="patient" field="gender" />
          <FieldRow label="Address" value={data.patient.address} fieldPath="patient.address" section="patient" field="address" />
          <FieldRow label="Phone" value={data.patient.contact_phone} fieldPath="patient.contact_phone" section="patient" field="contact_phone" />
          <FieldRow label="Email" value={data.patient.contact_email} fieldPath="patient.contact_email" section="patient" field="contact_email" />
        </div>

        {/* Insurance */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard size={13} className="text-primary" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Insurance Details</h4>
            <span className="badge-info ml-auto text-xs">Insurance Card</span>
          </div>
          <FieldRow label="Policyholder Name" value={data.insurance.policyholder_name} fieldPath="insurance.policyholder_name" section="insurance" field="policyholder_name" />
          <FieldRow label="Member ID" value={data.insurance.member_id} fieldPath="insurance.member_id" section="insurance" field="member_id" />
          <FieldRow label="Group Number" value={data.insurance.group_number} fieldPath="insurance.group_number" section="insurance" field="group_number" />
          <FieldRow label="Payer ID" value={data.insurance.payer_id} fieldPath="insurance.payer_id" section="insurance" field="payer_id" />
          <FieldRow label="Plan Name" value={data.insurance.plan_name} fieldPath="insurance.plan_name" section="insurance" field="plan_name" />
          <FieldRow label="Pre-Auth Code" value={data.pre_authorization.approval_code} fieldPath="pre_authorization.approval_code" section="pre_authorization" field="approval_code" />
        </div>

        {/* Clinical */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <div className="w-7 h-7 rounded-lg bg-success-bg flex items-center justify-center">
              <Stethoscope size={13} className="text-success" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Clinical Information</h4>
            <span className="badge-success ml-auto text-xs">Discharge Summary</span>
          </div>
          <FieldRow label="Facility Name" value={data.clinical.facility_name} fieldPath="clinical.facility_name" section="clinical" field="facility_name" />
          <FieldRow label="Hospital NPI" value={data.clinical.hospital_npi} fieldPath="clinical.hospital_npi" section="clinical" field="hospital_npi" />
          <FieldRow label="Tax ID" value={data.clinical.hospital_tax_id} fieldPath="clinical.hospital_tax_id" section="clinical" field="hospital_tax_id" />
          <FieldRow label="Attending Physician" value={data.clinical.attending_physician} fieldPath="clinical.attending_physician" section="clinical" field="attending_physician" />
          <FieldRow label="Admission Date" value={data.clinical.admission_date} fieldPath="clinical.admission_date" section="clinical" field="admission_date" />
          <FieldRow label="Discharge Date" value={data.clinical.discharge_date} fieldPath="clinical.discharge_date" section="clinical" field="discharge_date" />
        </div>

        {/* Billing */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <div className="w-7 h-7 rounded-lg bg-warning-bg flex items-center justify-center">
              <Receipt size={13} className="text-warning" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Billing Summary</h4>
            <span className="badge-warning ml-auto text-xs">Itemized Bill</span>
          </div>
          <div className="space-y-1.5 mb-3">
            {data.billing.line_items.map((item, i) => (
              <div key={`li-review-${i}`} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground flex-1">{item.description}</span>
                <span className="text-xs font-medium text-foreground font-tabular shrink-0">
                  ₹{parseInt(item.gross_charge).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-sm font-semibold text-foreground">Total Billed Amount</span>
            <span className="text-sm font-bold text-foreground font-tabular">
              ₹{parseInt(data.billing.total_billed_amount).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="card p-5 flex items-center justify-between">
        <button onClick={onBack} className="btn-secondary gap-2">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {lowCount > 0 ? `${lowCount} fields need review` : 'All fields verified'}
          </p>
          <button
            onClick={() => onConfirm(data)}
            className="btn-primary px-6 gap-2"
          >
            Confirm & Run Claim Scrubbing <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
