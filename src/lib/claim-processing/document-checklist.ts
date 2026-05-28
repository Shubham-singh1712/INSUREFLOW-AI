/**
 * document-checklist.ts
 *
 * Detects which mandatory supporting documents are present in the uploaded
 * preauth PDF by scanning OCR text for identifying patterns.
 *
 * Based on real preauth PDF analysis:
 *   - Pavan Yadav PDF:  preauth form | insurance card | Aadhaar | PAN x2 | clinical note
 *   - Bhikaji Gopale PDF: preauth form | policy schedule | Aadhaar back | PAN | clinical note
 *
 * Required documents for cashless preauth claim approval (TPA standard):
 *   1. Preauth form (filled + signed)       — CRITICAL
 *   2. Insurance / TPA membership card      — CRITICAL
 *   3. Aadhaar card                         — CRITICAL  (govt-mandated KYC)
 *   4. PAN card                             — HIGH      (for claims > Rs.1 lakh)
 *   5. Doctor's clinical note / referral    — HIGH
 *   6. Insurance policy schedule            — MEDIUM    (for first-time cashless)
 */

import { PageText, ClassifiedPage, DocumentChecklist, DocumentChecklistItem, PageDocType } from './types';
import { normalizeWhitespace } from './utils';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Document detector definitions
// Each detector independently scans all page texts and returns the best match.
// ---------------------------------------------------------------------------

interface DocDetector {
  id: string;
  label: string;
  required: boolean;
  severity: 'critical' | 'high' | 'medium';
  missingAction: string;
  /** Primary strong-signal patterns — any match = high confidence */
  strongPatterns: RegExp[];
  /** Secondary supporting patterns — used to boost confidence */
  supportPatterns: RegExp[];
  /** Patterns that extract a meaningful value (e.g. PAN number, Aadhaar digits) */
  valuePattern?: RegExp;
  /** Min confidence threshold to count as "present" */
  threshold: number;
}

const DETECTORS: DocDetector[] = [
  // -------------------------------------------------------------------------
  // 1. PREAUTH FORM — the main claim request form
  // -------------------------------------------------------------------------
  {
    id: 'preauth_form',
    label: 'Pre-Authorization Form',
    required: true,
    severity: 'critical',
    missingAction: 'Upload the completed and signed Pre-Authorization form (Annexure A / Part C)',
    strongPatterns: [
      /request\s*for\s*cashless\s*hospitali[sz]ation/i,
      /pre[-\s]?authori[sz]ation/i,
      /cashless\s*(?:request|claim|hospitali)/i,
      /to\s*be\s*filled\s*(?:by\s*)?(?:insured|patient|treating\s*doctor)/i,
      /annexure[-\s]?a/i,
      /part\s*[abc]\s*(?:revised)?/i,
      /cashless\s*access/i,
    ],
    supportPatterns: [
      /name\s*of\s*(?:the\s*)?patient/i,
      /insured\s*card\s*id/i,
      /provisional\s*diagnosis/i,
      /sum\s*total\s*expected\s*cost/i,
      /medi\s*assist|paramount\s*health/i,
    ],
    threshold: 70,
  },

  // -------------------------------------------------------------------------
  // 2. AADHAAR CARD — mandatory KYC document (UIDAI)
  // -------------------------------------------------------------------------
  {
    id: 'aadhaar_card',
    label: 'Aadhaar Card',
    required: true,
    severity: 'critical',
    missingAction: 'Upload a clear copy of the patient\'s Aadhaar card (front and back)',
    strongPatterns: [
      /unique\s*identification\s*authority\s*of\s*india/i,
      /uidai/i,
      /aadhaar|aadhar|adhar/i,
      /\b\d{4}\s*\d{4}\s*\d{4}\b/,            // 12-digit Aadhaar number
      /माझे\s*आधार|मेरा\s*आधार/,               // Marathi/Hindi Aadhaar tagline
      /भारत\s*सरकार.*government\s*of\s*india/i, // Govt header on Aadhaar
      /vid\s*:\s*\d{16}/i,                      // VID number on Aadhaar
      /help@uidai\.gov\.in/i,
      /www\.uidai\.gov\.in/i,
    ],
    supportPatterns: [
      /government\s*of\s*india/i,
      /date\s*of\s*birth|dob|जन्म\s*तारीख/i,
      /male|female|पुरुष|महिला/i,
      /download\s*date/i,
    ],
    valuePattern: /\b(\d{4})\s*\d{4}\s*(\d{4})\b/,  // Extracts first+last 4 digits
    threshold: 60,
  },

  // -------------------------------------------------------------------------
  // 3. PAN CARD — mandatory for high-value claims
  // -------------------------------------------------------------------------
  {
    id: 'pan_card',
    label: 'PAN Card',
    required: true,
    severity: 'high',
    missingAction: 'Upload a clear copy of the patient\'s PAN card',
    strongPatterns: [
      /permanent\s*account\s*number\s*card/i,
      /income\s*tax\s*department/i,
      /आयकर\s*विभाग/,                           // Hindi: Income Tax Department
      /\b[A-Z]{5}\d{4}[A-Z]\b/,                 // PAN format e.g. ARVPY0847M
      /स्थायी\s*लेखा\s*संख्या\s*काड/,           // Hindi PAN card text
    ],
    supportPatterns: [
      /govt\.?\s*of\s*india|government\s*of\s*india/i,
      /father['s\s]*name/i,
      /date\s*of\s*birth/i,
      /signature|हस्ताक्षर/i,
    ],
    valuePattern: /\b([A-Z]{5}\d{4}[A-Z])\b/,   // Extracts PAN number
    threshold: 60,
  },

  // -------------------------------------------------------------------------
  // 4. INSURANCE MEMBERSHIP CARD — TPA-issued health card
  // -------------------------------------------------------------------------
  {
    id: 'insurance_card_member',
    label: 'Insurance / TPA Membership Card',
    required: true,
    severity: 'critical',
    missingAction: 'Upload a copy of the TPA/insurance membership card (front)',
    strongPatterns: [
      /phs\s*id|phs\s*id\s*no/i,               // Paramount: "PHS ID :- 45759789"
      /e\.?code|employee\s*code/i,              // Paramount: "E.Code : 833874"
      /group\s*code/i,                          // Paramount: "Group Code :- WCDT"
      /valid\s*upto/i,                          // Card expiry
      /relation\s*:-?\s*(?:employee|spouse|parent|father|mother|child)/i,
      /paramount\s*health.*tata\s*aig|tata\s*aig.*paramount/i,
      /medi\s*assist.*card|mediassist.*id/i,
    ],
    supportPatterns: [
      /paramount\s*health|medi\s*assist|star\s*health|bajaj\s*allianz|new\s*india/i,
      /health\s*insurance/i,
      /member\s*(?:id|no|name)/i,
    ],
    threshold: 60,
  },

  // -------------------------------------------------------------------------
  // 5. DOCTOR'S CLINICAL NOTE / REFERRAL LETTER
  // -------------------------------------------------------------------------
  {
    id: 'clinical_note_doctor',
    label: "Doctor's Clinical Note / Referral Letter",
    required: true,
    severity: 'high',
    missingAction: "Upload the treating doctor's clinical note or referral letter on hospital letterhead",
    strongPatterns: [
      /life\s*care.*(?:hospital|annexe|annex)/i,  // Life Care Hospital letterhead
      /(?:hospital|clinic)\s*letterhead/i,
      /reg\.?\s*no\.?\s*\d{7,}/i,                 // Doctor Reg No. on note
      /mbbs|md|ms|dnb|frcs|mrcp/i,               // Medical qualifications
      /consulting\s*surgeon|consulting\s*physician/i,
      /(?:c\/o|c\.o\.?)\s*(?:pain|fever|complaint|vomiting|swelling)/i, // c/o symptoms
      /(?:p\/r|p\.r\.?)\s*(?:diagnosis|findings?|examination)/i,
    ],
    supportPatterns: [
      /dr\.?\s+[a-z]+/i,
      /patient\s*name|pt\./i,
      /age|years|male|female/i,
      /diagnosis|adv|advised/i,
    ],
    threshold: 55,
  },

  // -------------------------------------------------------------------------
  // 6. POLICY SCHEDULE — insurance policy document
  // -------------------------------------------------------------------------
  {
    id: 'policy_schedule',
    label: 'Insurance Policy Schedule',
    required: false,
    severity: 'medium',
    missingAction: 'Upload the insurance policy schedule document for reference',
    strongPatterns: [
      /policy\s*schedule/i,
      /policy\s*period/i,
      /sum\s*insured/i,
      /new\s*india\s*(?:assurance|mediclaim)/i,
      /star\s*health\s*(?:and\s*allied|insurance)/i,
      /niahlip|nianp/i,                           // New India policy number prefix
      /previous\s*policy\s*(?:no|number|period)/i,
      /policyholder['\s]*(?:name|details?)/i,
    ],
    supportPatterns: [
      /policy\s*(?:no|number)/i,
      /premium\s*(?:details?|amount)/i,
      /tpa\s*(?:name|details?)/i,
      /insured\s*persons?\s*details?/i,
    ],
    threshold: 60,
  },
];

// ---------------------------------------------------------------------------
// Score a single page against a detector
// ---------------------------------------------------------------------------
function scorePageForDoc(
  pageText: string,
  detector: DocDetector
): { score: number; extractedValue?: string } {
  const text = normalizeWhitespace(pageText);
  if (!text || text.length < 15) return { score: 0 };

  let score = 0;

  // Strong patterns: each hit adds 35 points (capped at 95)
  for (const pattern of detector.strongPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      score += 35;
      if (score >= 95) { score = 95; break; }
    }
  }

  // Support patterns: each hit adds 8 points
  if (score > 0) {
    for (const pattern of detector.supportPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        score = Math.min(score + 8, 99);
      }
    }
  }

  // Try to extract a value
  let extractedValue: string | undefined;
  if (detector.valuePattern) {
    detector.valuePattern.lastIndex = 0;
    const match = text.match(detector.valuePattern);
    if (match) {
      extractedValue = match[1] ?? match[0];
    }
  }

  return { score, extractedValue };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export function buildDocumentChecklist(pages: PageText[]): DocumentChecklist {
  logger.info('DOC_CHECKLIST', `Building document checklist from ${pages.length} pages`);

  const items: DocumentChecklistItem[] = DETECTORS.map((detector) => {
    let bestScore = 0;
    let bestPage: number | null = null;
    let bestValue: string | undefined;

    for (const page of pages) {
      const { score, extractedValue } = scorePageForDoc(page.text, detector);
      if (score > bestScore) {
        bestScore = score;
        bestPage = page.page;
        if (extractedValue) bestValue = extractedValue;
      }
    }

    const present = bestScore >= detector.threshold;

    logger.info(
      'DOC_CHECKLIST',
      `  ${detector.id}: ${present ? '✓ FOUND' : '✗ MISSING'} (score=${bestScore}, page=${bestPage})`
    );

    return {
      id: detector.id,
      label: detector.label,
      required: detector.required,
      present,
      page: present ? bestPage : null,
      confidence: Math.min(bestScore, 99),
      extractedValue: bestValue,
      missingAction: present ? undefined : detector.missingAction,
    };
  });

  const missingRequired = items
    .filter((item) => item.required && !item.present)
    .map((item) => item.id);

  return {
    items,
    allRequiredPresent: missingRequired.length === 0,
    missingRequired,
  };
}

/**
 * Returns validation-style errors for missing required documents.
 * These are injected into the main ValidationError array.
 */
export function getDocumentChecklistErrors(
  checklist: DocumentChecklist
): Array<{ field: string; issue: string; severity: 'critical' | 'high' | 'medium' | 'low'; pages: number[] }> {
  return checklist.items
    .filter((item) => item.required && !item.present)
    .map((item) => {
      const severity: 'critical' | 'high' | 'medium' | 'low' =
        item.id === 'preauth_form' || item.id === 'aadhaar_card' || item.id === 'insurance_card_member'
          ? 'critical'
          : item.id === 'pan_card' || item.id === 'clinical_note_doctor'
          ? 'high'
          : 'medium';

      return {
        field: `documents.${item.id}`,
        issue: `Missing required document: ${item.label}. ${item.missingAction ?? ''}`,
        severity,
        pages: [],
      };
    });
}
