'use client';
import React from 'react';
import { useForm } from 'react-hook-form';
import { User, Building2, Calendar, Stethoscope, CreditCard, FileText, ArrowRight } from 'lucide-react';

interface PatientFormData {
  patientName: string;
  dateOfBirth: string;
  gender: string;
  contactNumber: string;
  hospitalName: string;
  wardType: string;
  admissionDate: string;
  dischargeDate: string;
  attendingPhysician: string;
  diagnosisCode: string;
  diagnosisDescription: string;
  procedureCodes: string;
  tpaName: string;
  policyNumber: string;
  groupNumber: string;
  preAuthNumber: string;
  insuranceCardNumber: string;
  policyHolderName: string;
  claimType: string;
  estimatedAmount: string;
}

interface PatientInfoFormProps {
  onNext: (data: Record<string, string>) => void;
}

export default function PatientInfoForm({ onNext }: PatientInfoFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<PatientFormData>();

  const onSubmit = (data: PatientFormData) => {
    onNext(data as unknown as Record<string, string>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patient Demographics */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
            <div className="w-8 h-8 rounded-xl bg-info-bg flex items-center justify-center">
              <User size={15} className="text-info" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">Patient Demographics</h3>
              <p className="text-xs text-muted-foreground">Personal and medical admission details</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Full Patient Name <span className="text-danger">*</span></label>
              <input
                {...register('patientName', { required: 'Patient name is required' })}
                type="text"
                placeholder="e.g. Ramesh Kumar Iyer"
                className="input-field"
              />
              {errors.patientName && <p className="error-text">{errors.patientName.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date of Birth <span className="text-danger">*</span></label>
                <input
                  {...register('dateOfBirth', { required: 'Date of birth is required' })}
                  type="date"
                  className="input-field"
                />
                {errors.dateOfBirth && <p className="error-text">{errors.dateOfBirth.message}</p>}
              </div>
              <div>
                <label className="label">Gender <span className="text-danger">*</span></label>
                <select
                  {...register('gender', { required: 'Gender is required' })}
                  className="input-field appearance-none bg-white"
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                {errors.gender && <p className="error-text">{errors.gender.message}</p>}
              </div>
            </div>

            <div>
              <label className="label">Contact Number</label>
              <input
                {...register('contactNumber')}
                type="tel"
                placeholder="+91 98765 43210"
                className="input-field"
              />
              <p className="helper-text">Patient or guardian contact for claim queries</p>
            </div>

            <div>
              <label className="label">Hospital / Facility Name <span className="text-danger">*</span></label>
              <div className="relative">
                <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  {...register('hospitalName', { required: 'Hospital name is required' })}
                  type="text"
                  placeholder="Apollo Hospitals, Greams Road"
                  className="input-field pl-10"
                />
              </div>
              {errors.hospitalName && <p className="error-text">{errors.hospitalName.message}</p>}
            </div>

            <div>
              <label className="label">Ward / Room Type</label>
              <select {...register('wardType')} className="input-field appearance-none bg-white">
                <option value="">Select ward type</option>
                <option value="general">General Ward</option>
                <option value="semi_private">Semi-Private Room</option>
                <option value="private">Private Room</option>
                <option value="icu">ICU / Critical Care</option>
                <option value="day_care">Day Care</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Admission Date <span className="text-danger">*</span></label>
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    {...register('admissionDate', { required: 'Admission date is required' })}
                    type="date"
                    className="input-field pl-9"
                  />
                </div>
                {errors.admissionDate && <p className="error-text">{errors.admissionDate.message}</p>}
              </div>
              <div>
                <label className="label">Discharge Date <span className="text-danger">*</span></label>
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    {...register('dischargeDate', { required: 'Discharge date is required' })}
                    type="date"
                    className="input-field pl-9"
                  />
                </div>
                {errors.dischargeDate && <p className="error-text">{errors.dischargeDate.message}</p>}
              </div>
            </div>

            <div>
              <label className="label">Attending Physician <span className="text-danger">*</span></label>
              <div className="relative">
                <Stethoscope size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  {...register('attendingPhysician', { required: 'Attending physician is required' })}
                  type="text"
                  placeholder="Dr. Suresh Babu, Cardiologist"
                  className="input-field pl-10"
                />
              </div>
              {errors.attendingPhysician && <p className="error-text">{errors.attendingPhysician.message}</p>}
            </div>

            <div>
              <label className="label">Primary Diagnosis Code (ICD-10) <span className="text-danger">*</span></label>
              <input
                {...register('diagnosisCode', {
                  required: 'Diagnosis code is required',
                  pattern: { value: /^[A-Z]\d{2}(\.\d{1,4})?$/, message: 'Enter a valid ICD-10 code (e.g. I21.0)' },
                })}
                type="text"
                placeholder="e.g. I21.0 — Acute transmural MI"
                className="input-field font-tabular"
              />
              {errors.diagnosisCode && <p className="error-text">{errors.diagnosisCode.message}</p>}
              <p className="helper-text">ICD-10 code as listed on the discharge summary</p>
            </div>

            <div>
              <label className="label">Diagnosis Description</label>
              <textarea
                {...register('diagnosisDescription')}
                rows={2}
                placeholder="Brief clinical description of the primary diagnosis"
                className="input-field resize-none"
              />
            </div>

            <div>
              <label className="label">Procedure Codes (CPT/ICD)</label>
              <input
                {...register('procedureCodes')}
                type="text"
                placeholder="e.g. 92928, 93510 (comma-separated)"
                className="input-fieldfont-tabular"
              />
              <p className="helper-text">Separate multiple codes with commas</p>
            </div>
          </div>
        </div>

        {/* Insurance Metadata */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
            <div className="w-8 h-8 rounded-xl bg-warning-bg flex items-center justify-center">
              <CreditCard size={15} className="text-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">Insurance & Policy Details</h3>
              <p className="text-xs text-muted-foreground">TPA and policy information for claim routing</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">TPA / Insurance Provider <span className="text-danger">*</span></label>
              <select
                {...register('tpaName', { required: 'TPA is required' })}
                className="input-field appearance-none bg-white"
              >
                <option value="">Select TPA / Insurer</option>
                <option value="apollo_munich">Apollo Munich Health Insurance</option>
                <option value="star_health">Star Health & Allied Insurance</option>
                <option value="hdfc_ergo">HDFC ERGO General Insurance</option>
                <option value="icici_lombard">ICICI Lombard General Insurance</option>
                <option value="bajaj_allianz">Bajaj Allianz General Insurance</option>
                <option value="new_india">New India Assurance</option>
                <option value="united_india">United India Insurance</option>
                <option value="max_bupa">Max Bupa Health Insurance</option>
                <option value="national">National Insurance Company</option>
                <option value="oriental">Oriental Insurance Company</option>
              </select>
              {errors.tpaName && <p className="error-text">{errors.tpaName.message}</p>}
            </div>

            <div>
              <label className="label">Policy Number <span className="text-danger">*</span></label>
              <div className="relative">
                <FileText size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  {...register('policyNumber', { required: 'Policy number is required' })}
                  type="text"
                  placeholder="e.g. HDFC-HLT-2024-0048271"
                  className="input-field pl-10 font-tabular"
                />
              </div>
              {errors.policyNumber && <p className="error-text">{errors.policyNumber.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Group / Corporate Number</label>
                <input
                  {...register('groupNumber')}
                  type="text"
                  placeholder="GRP-00482"
                  className="input-field font-tabular"
                />
                <p className="helper-text">For corporate / group health policies</p>
              </div>
              <div>
                <label className="label">Insurance Card Number <span className="text-danger">*</span></label>
                <input
                  {...register('insuranceCardNumber', { required: 'Insurance card number is required' })}
                  type="text"
                  placeholder="IC-7748291034"
                  className="input-field font-tabular"
                />
                {errors.insuranceCardNumber && <p className="error-text">{errors.insuranceCardNumber.message}</p>}
              </div>
            </div>

            <div>
              <label className="label">Pre-Authorization Number</label>
              <input
                {...register('preAuthNumber')}
                type="text"
                placeholder="PA-2026-00847 (if applicable)"
                className="input-field font-tabular"
              />
              <p className="helper-text">Required for planned procedures and elective surgeries</p>
            </div>

            <div>
              <label className="label">Policy Holder Name <span className="text-danger">*</span></label>
              <input
                {...register('policyHolderName', { required: 'Policy holder name is required' })}
                type="text"
                placeholder="Name as on insurance policy"
                className="input-field"
              />
              {errors.policyHolderName && <p className="error-text">{errors.policyHolderName.message}</p>}
              <p className="helper-text">May differ from patient name (e.g. spouse or parent)</p>
            </div>

            <div>
              <label className="label">Claim Type <span className="text-danger">*</span></label>
              <select
                {...register('claimType', { required: 'Claim type is required' })}
                className="input-field appearance-none bg-white"
              >
                <option value="">Select claim type</option>
                <option value="cashless">Cashless Hospitalization</option>
                <option value="reimbursement">Reimbursement</option>
                <option value="pre_auth">Pre-Authorization Request</option>
                <option value="top_up">Top-Up Claim</option>
                <option value="critical_illness">Critical Illness</option>
                <option value="maternity">Maternity Benefit</option>
              </select>
              {errors.claimType && <p className="error-text">{errors.claimType.message}</p>}
            </div>

            <div>
              <label className="label">Estimated Claim Amount (INR) <span className="text-danger">*</span></label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₹</span>
                <input
                  {...register('estimatedAmount', {
                    required: 'Estimated amount is required',
                    pattern: { value: /^\d+(\.\d{1,2})?$/, message: 'Enter a valid amount' },
                  })}
                  type="text"
                  placeholder="0.00"
                  className="input-field pl-7 font-tabular"
                />
              </div>
              {errors.estimatedAmount && <p className="error-text">{errors.estimatedAmount.message}</p>}
              <p className="helper-text">Total hospital bill amount before insurance deductions</p>
            </div>

            {/* Required fields note */}
            <div className="rounded-xl bg-info-bg border border-info/20 px-4 py-3 mt-2">
              <p className="text-xs text-info-foreground font-medium">
                Fields marked <span className="text-danger font-bold">*</span> are required for AI validation. Missing fields will reduce your submission readiness score.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form actions */}
      <div className="flex items-center justify-between mt-6 pt-4">
        <a href="/main-dashboard" className="btn-secondary">
          Cancel
        </a>
        <button type="submit" className="btn-primary px-8">
          Save & Continue <ArrowRight size={15} />
        </button>
      </div>
    </form>
  );
}