'use client';

/**
 * DocumentChecklistPanel.tsx
 *
 * Displays which mandatory supporting documents were detected in the uploaded
 * PDF vs. which are missing. Missing required docs block claim approval.
 *
 * Designed to be shown in the AI Scanning / Review steps.
 */

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  CreditCard,
  Fingerprint,
  IdCard,
  Stethoscope,
  Shield,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Types (mirrors document-checklist.ts on the server) ──────────────────────
export interface DocumentChecklistItem {
  id: string;
  label: string;
  required: boolean;
  present: boolean;
  page: number | null;
  confidence: number;
  extractedValue?: string;
  missingAction?: string;
}

export interface DocumentChecklist {
  items: DocumentChecklistItem[];
  allRequiredPresent: boolean;
  missingRequired: string[];
}

// ─── Icon map ─────────────────────────────────────────────────────────────────
const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  preauth_form: FileText,
  aadhaar_card: Fingerprint,
  pan_card: IdCard,
  insurance_card_member: CreditCard,
  clinical_note_doctor: Stethoscope,
  policy_schedule: Shield,
};

// ─── Severity colors ──────────────────────────────────────────────────────────
function getSeverityClasses(item: DocumentChecklistItem) {
  if (item.present) {
    return {
      border: 'border-success/20',
      bg: 'bg-success-bg/30',
      icon: 'bg-success-bg',
      dot: 'bg-success',
      text: 'text-success-foreground',
    };
  }
  if (!item.required) {
    return {
      border: 'border-border',
      bg: 'bg-muted/30',
      icon: 'bg-muted',
      dot: 'bg-muted-foreground',
      text: 'text-muted-foreground',
    };
  }
  // Missing + required
  return {
    border: 'border-danger/25',
    bg: 'bg-danger-bg/20',
    icon: 'bg-danger-bg',
    dot: 'bg-danger',
    text: 'text-danger-foreground',
  };
}

// ─── Single item card ─────────────────────────────────────────────────────────
function ChecklistItemCard({ item }: { item: DocumentChecklistItem }) {
  const [expanded, setExpanded] = React.useState(false);
  const cls = getSeverityClasses(item);
  const Icon = iconMap[item.id] ?? FileText;

  return (
    <div
      className={`rounded-xl border ${cls.border} ${cls.bg} p-3 transition-all duration-200`}
      id={`doc-checklist-${item.id}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg ${cls.icon} flex items-center justify-center shrink-0`}>
          {item.present ? (
            <CheckCircle2 size={15} className="text-success" />
          ) : item.required ? (
            <XCircle size={15} className="text-danger" />
          ) : (
            <Icon size={15} className="text-muted-foreground" />
          )}
        </div>

        {/* Label + Status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs font-semibold ${item.present ? 'text-foreground' : item.required ? 'text-danger-foreground' : 'text-muted-foreground'}`}>
              {item.label}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {item.required && (
                <span className="text-[10px] font-semibold text-danger uppercase tracking-wide">
                  Required
                </span>
              )}
              {item.present && item.page && (
                <span className="badge-success text-[10px]">p.{item.page}</span>
              )}
              {item.present && (
                <span className="badge-success text-[10px]">{item.confidence}%</span>
              )}
            </div>
          </div>

          {/* Extracted value if available */}
          {item.present && item.extractedValue && (
            <p className="text-[11px] text-muted-foreground mt-0.5 font-tabular">
              Detected: <span className="font-semibold text-foreground">{item.extractedValue}</span>
            </p>
          )}

          {/* Missing action — expandable */}
          {!item.present && item.missingAction && (
            <div className="mt-1.5">
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {expanded ? 'Hide action' : 'What to do?'}
              </button>
              {expanded && (
                <p className="mt-1.5 text-[11px] text-danger-foreground leading-relaxed bg-white/60 rounded-lg p-2 border border-danger/10">
                  {item.missingAction}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
interface DocumentChecklistPanelProps {
  checklist: DocumentChecklist;
  /** If true, show in compact single-column list mode */
  compact?: boolean;
}

export default function DocumentChecklistPanel({
  checklist,
  compact = false,
}: DocumentChecklistPanelProps) {
  const requiredItems = checklist.items.filter((i) => i.required);
  const optionalItems = checklist.items.filter((i) => !i.required);
  const presentCount = checklist.items.filter((i) => i.present).length;
  const missingCount = checklist.missingRequired.length;

  return (
    <div className="card p-5" id="document-checklist-panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Shield size={15} className={checklist.allRequiredPresent ? 'text-success' : 'text-danger'} />
            Supporting Documents Checklist
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {presentCount}/{checklist.items.length} documents detected in uploaded PDF
          </p>
        </div>
        {checklist.allRequiredPresent ? (
          <span className="badge-success text-[11px] flex items-center gap-1">
            <CheckCircle2 size={11} /> All required present
          </span>
        ) : (
          <span className="badge-danger text-[11px] flex items-center gap-1">
            <AlertTriangle size={11} /> {missingCount} missing
          </span>
        )}
      </div>

      {/* Blocking banner if required docs missing */}
      {!checklist.allRequiredPresent && (
        <div className="rounded-xl border border-danger/20 bg-danger-bg/30 p-3 mb-4">
          <p className="text-xs font-semibold text-danger-foreground flex items-center gap-1.5">
            <XCircle size={13} className="text-danger shrink-0" />
            Claim cannot be approved until all required documents are provided
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Missing: {checklist.missingRequired.map((id) => {
              const item = checklist.items.find((i) => i.id === id);
              return item?.label ?? id;
            }).join(', ')}
          </p>
        </div>
      )}

      {/* Required documents */}
      <div className={compact ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-2'}>
        {requiredItems.map((item) => (
          <ChecklistItemCard key={item.id} item={item} />
        ))}
      </div>

      {/* Optional documents */}
      {optionalItems.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-4 mb-2">
            Optional Documents
          </p>
          <div className={compact ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-2'}>
            {optionalItems.map((item) => (
              <ChecklistItemCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
