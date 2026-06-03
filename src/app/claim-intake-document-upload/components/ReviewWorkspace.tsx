'use client';

import React, { useState } from 'react';
import { ClaimPacket, UiClaimField } from '@/lib/claim-processing/types';
import {
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Clock,
  Menu,
  Maximize2,
  Minimize2,
  X,
  Info,
  Shield,
  Activity,
  User,
  Hospital,
  DollarSign,
  CheckSquare
} from 'lucide-react';

interface ReviewWorkspaceProps {
  claimData: {
    packet: ClaimPacket;
    uiFields: UiClaimField[];
  };
  fileUrl: string | null;
  setClaimData: React.Dispatch<React.SetStateAction<{ packet: ClaimPacket; uiFields: UiClaimField[] } | null>>;
  handleFieldChange: (fieldId: string, newValue: string) => void;
  handleCompleteValidation: () => void;
  handleSubmit: () => void;
  isInValidationStage: boolean;
  isReadyStage: boolean;
  canApproveValidation: boolean;
}

const CATEGORIES = [
  { id: 'patient', label: 'Patient Information', icon: User },
  { id: 'insurance', label: 'Insurance Information', icon: Shield },
  { id: 'hospital', label: 'Hospital Information', icon: Hospital },
  { id: 'clinical', label: 'Diagnosis & Treatment', icon: Activity },
  { id: 'financial', label: 'Billing Information', icon: DollarSign },
  { id: 'authorization', label: 'Signatures / Seal', icon: CheckSquare },
  { id: 'audit_trail', label: 'Audit Trail', icon: FileText },
];

export default function ReviewWorkspace({
  claimData,
  fileUrl,
  setClaimData,
  handleFieldChange,
  handleCompleteValidation,
  handleSubmit,
  isInValidationStage,
  isReadyStage,
  canApproveValidation
}: ReviewWorkspaceProps) {
  const { packet, uiFields } = claimData;
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [expandedSection, setExpandedSection] = useState<string>('patient');

  const handleGoToPage = (page: number) => {
    setIsDrawerOpen(true);
    setCurrentPage(page);
  };

  const getHumanReadableIssue = (field: string, issue: string) => {
    if (field === 'authorization.patient_signature') return 'Missing Patient Signature';
    if (field === 'authorization.doctor_signature') return 'Missing Doctor Signature';
    if (field === 'authorization.hospital_seal') return 'Missing Hospital Seal';
    if (field === 'documents.insurance_card_member') return 'Insurance Card Missing';
    if (field === 'clinical.diagnosis') return 'Missing Primary Diagnosis';
    if (field === 'financial.total_claimed') return 'Total Claimed Amount Mismatch';
    if (field.startsWith('financial.')) return `Missing ${field.replace('financial.', '').replace('_', ' ')} breakdown`;
    return issue;
  };

  const criticalIssues = packet.validationErrors.filter(e => e.severity === 'critical');
  const warningIssues = packet.validationErrors.filter(e => e.severity === 'high' || e.severity === 'medium');

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-slate-50 overflow-hidden w-full relative">
      
      {/* --- COLLAPSIBLE DOCUMENT DRAWER --- */}
      <div 
        className={`bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col z-20 ${
          isDrawerOpen ? 'w-[35%] md:w-[30%] lg:w-[35%]' : 'w-0 border-r-0 overflow-hidden opacity-0'
        }`}
      >
        <div className="p-4 border-b border-slate-200 flex justify-between items-center shrink-0">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-indigo-600" />
            Uploaded Documents
          </h2>
          <button 
            onClick={() => setIsDrawerOpen(false)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Document List Thumbnail / Selector */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {packet.classifiedPages.map(page => (
              <button 
                key={page.page} 
                onClick={() => setCurrentPage(page.page)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  currentPage === page.page || (currentPage === null && page.page === 1)
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Page {page.page}: {page.type}
              </button>
            ))}
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 bg-slate-200/50 p-2 relative">
          {fileUrl ? (
            <iframe
              src={`${fileUrl}${currentPage ? `#page=${currentPage}` : ''}`}
              className="w-full h-full rounded shadow-sm border border-slate-200 bg-white"
              title="Source Document"
            />
          ) : (
             <div className="flex h-full items-center justify-center text-slate-400 flex-col">
              <FileText className="w-8 h-8 mb-3 text-slate-300" />
              <span className="text-xs font-medium">No document available</span>
            </div>
          )}
        </div>
      </div>

      {/* --- REVIEW WORKSPACE --- */}
      <div className={`flex-1 flex flex-col overflow-hidden bg-slate-50 transition-all duration-300 w-full`}>
        
        {/* Workspace Header */}
        <div className="bg-white border-b border-slate-200 p-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm z-10 relative">
          
          <div className="flex items-center gap-4">
            {!isDrawerOpen && (
              <button 
                onClick={() => setIsDrawerOpen(true)}
                className="btn-secondary gap-2 text-xs py-1.5 px-3"
              >
                <Menu className="w-4 h-4" /> Documents
              </button>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Claim ID: {packet.claimId.slice(0, 9)}...</h1>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status: <span className="text-indigo-600">{packet.state.replace(/_/g, ' ')}</span>
                </span>
                <span className="h-3 w-px bg-slate-300"></span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Intake Score: <span className={packet.claimHealth >= 80 ? 'text-emerald-600' : packet.claimHealth >= 50 ? 'text-amber-600' : 'text-rose-600'}>{packet.claimHealth}%</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
              Reject
            </button>
            <button className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
              Request Docs
            </button>
            <button
              onClick={isInValidationStage ? handleCompleteValidation : isReadyStage ? handleSubmit : undefined}
              disabled={isInValidationStage ? !canApproveValidation : !isReadyStage}
              className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              {isInValidationStage ? 'Approve Validation' : isReadyStage ? 'Submit Claim' : 'Under Review'}
            </button>
          </div>
        </div>

        {/* Process Tracker */}
        <div className="bg-white border-b border-slate-200 px-6 py-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle className="w-3.5 h-3.5"/> Intake</span>
            <span className="w-8 h-px bg-slate-300"></span>
            <span className={`flex items-center gap-1.5 ${isInValidationStage || isReadyStage ? 'text-indigo-600' : 'text-emerald-600'}`}>
              {isInValidationStage ? <Clock className="w-3.5 h-3.5"/> : <CheckCircle className="w-3.5 h-3.5"/>} Validation
            </span>
            <span className="w-8 h-px bg-slate-300"></span>
            <span className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300"></div> Approval</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="max-w-6xl mx-auto flex flex-col xl:flex-row gap-6 relative items-start">
            
            {/* Main Accordion Area */}
            <div className="flex-1 space-y-4 min-w-0">
              
              {/* Validation Issues - Always on top if there are errors */}
              {packet.validationErrors.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                    Validation Issues ({packet.validationErrors.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {packet.validationErrors.map((err, idx) => {
                      const isCritical = err.severity === 'critical';
                      const humanIssue = getHumanReadableIssue(err.field, err.issue);
                      return (
                        <div key={idx} className={`p-4 rounded-xl border ${isCritical ? 'bg-rose-50/50 border-rose-200' : 'bg-amber-50/50 border-amber-200'} shadow-sm`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isCritical ? 'text-rose-600' : 'text-amber-600'}`}>
                                [{isCritical ? 'CRITICAL' : 'WARNING'}]
                              </div>
                              <h4 className="text-sm font-semibold text-slate-800 leading-snug">{humanIssue}</h4>
                            </div>
                            {err.pages && err.pages.length > 0 && (
                              <button 
                                onClick={() => handleGoToPage(err.pages[0])}
                                className="shrink-0 text-xs font-semibold px-3 py-1.5 bg-white border border-slate-200 rounded shadow-sm text-slate-600 hover:bg-slate-50 transition-colors"
                              >
                                Go To Page {err.pages[0]}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Accordions */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden divide-y divide-slate-100">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const isExpanded = expandedSection === cat.id;
                  
                  return (
                    <div key={cat.id} className="transition-all duration-200">
                      <button 
                        onClick={() => setExpandedSection(isExpanded ? '' : cat.id)}
                        className={`w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50/80' : ''}`}
                      >
                        <div className="flex items-center gap-3 text-slate-700">
                          <Icon className={`w-5 h-5 ${isExpanded ? 'text-indigo-600' : 'text-slate-400'}`} />
                          <span className="font-bold text-sm">{cat.label}</span>
                        </div>
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                      </button>
                      
                      {isExpanded && (
                        <div className="p-4 bg-white border-t border-slate-50">
                          {cat.id === 'audit_trail' ? (
                            <div className="space-y-4 pl-4 border-l-2 border-slate-200 py-2">
                              {(packet.auditLogs || []).map((log: any, idx: number) => (
                                <div key={idx} className="relative">
                                  <span className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-slate-300 border-2 border-white" />
                                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {log.action || log.stage}
                                  </div>
                                  <p className="text-sm text-slate-700 mt-0.5">{log.details || log.message}</p>
                                </div>
                              ))}
                              {(packet.auditLogs || []).length === 0 && (
                                <p className="text-sm text-slate-500">No audit logs available.</p>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-0">
                              {uiFields.filter(f => f.id.startsWith(cat.id + '.')).map(field => {
                                const errorForField = packet.validationErrors.find(e => e.field === field.id);
                                return (
                                  <div key={field.id} className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-slate-100 last:border-0 group">
                                    <div className="w-[180px] shrink-0 text-xs font-semibold text-slate-500 flex items-center gap-2 mb-2 sm:mb-0">
                                      {field.label}
                                      {errorForField && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                                    </div>
                                    <div className="flex-1 flex items-center gap-3">
                                      <input
                                        type="text"
                                        value={field.value || ''}
                                        onChange={(e) => handleFieldChange(field.id, e.target.value)}
                                        className={`flex-1 bg-transparent px-3 py-1.5 rounded-md text-sm font-medium text-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 border border-transparent hover:border-slate-200 focus:border-indigo-400 focus:bg-white ${errorForField ? 'bg-rose-50/50 text-rose-900 border-rose-200 focus:border-rose-400' : ''}`}
                                        placeholder={`--`}
                                      />
                                      {field.page && (
                                        <button 
                                          onClick={() => handleGoToPage(field.page!)}
                                          className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                                          title={`Jump to Page ${field.page}`}
                                        >
                                          Pg {field.page}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sticky Validation Summary Component */}
            <div className="w-full xl:w-72 shrink-0 xl:sticky xl:top-6">
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-bold text-sm text-slate-800">Validation Status</h3>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${packet.readiness === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                        style={{ width: `${packet.readiness}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-bold text-slate-700">{packet.readiness}%</span>
                  </div>
                </div>
                
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500"></div> Critical Issues
                    </span>
                    <span className="font-bold text-slate-700">{criticalIssues.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div> Warnings
                    </span>
                    <span className="font-bold text-slate-700">{warningIssues.length}</span>
                  </div>
                  
                  <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center text-sm font-bold">
                    <span className="text-slate-800">Issues Remaining</span>
                    <span className={packet.validationErrors.length > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      {packet.validationErrors.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
