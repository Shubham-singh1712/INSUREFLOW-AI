import { PageText, ClassifiedPage, PageDocType } from './types';
import { normalizeWhitespace, clamp } from './utils';
import { logger } from './logger';

const classifiers: Array<{
  type: PageDocType;
  confidence: number;
  patterns: RegExp[];
}> = [
  {
    // Aadhaar card — very high confidence signals
    type: 'aadhaar_card',
    confidence: 97,
    patterns: [
      /unique\s*identification\s*authority\s*of\s*india/i,
      /uidai/i,
      /aadhaar|aadhar|adhar/i,
      /\b\d{4}\s*\d{4}\s*\d{4}\b/,
      /माझे\s*आधार|मेरा\s*आधार/,
      /help@uidai\.gov\.in/i,
      /vid\s*:\s*\d/i,
    ],
  },
  {
    // PAN card — Income Tax Department document
    type: 'pan_card',
    confidence: 97,
    patterns: [
      /permanent\s*account\s*number\s*card/i,
      /income\s*tax\s*department/i,
      /आयकर\s*विभाग/,
      /\b[A-Z]{5}\d{4}[A-Z]\b/,
      /स्थायी\s*लेखा\s*संख्या/,
    ],
  },
  {
    // TPA / Insurer membership card
    type: 'insurance_card_member',
    confidence: 92,
    patterns: [
      /phs\s*id/i,
      /e\.?code\s*:/i,
      /group\s*code/i,
      /valid\s*upto/i,
      /relation\s*:-?\s*(?:employee|spouse|parent|father|mother|child)/i,
      /paramount\s*health|medi\s*assist/i,
    ],
  },
  {
    // Doctor's clinical note on hospital letterhead
    type: 'clinical_note_doctor',
    confidence: 88,
    patterns: [
      /life\s*care.*(?:hospital|annexe|annex)/i,
      /reg\.?\s*no\.?\s*\d{7,}/i,
      /mbbs|md(?:\s*,|\s*dnb)|ms\s*,|dnb|frcs/i,
      /consulting\s*(?:surgeon|physician|doctor)/i,
      /c\/o[-\s]+(?:pain|fever|vomiting|swelling|complaint)/i,
      /p\/r[-\s]+(?:diagnosis|examination|findings)/i,
    ],
  },
  {
    // Insurance policy schedule
    type: 'policy_schedule',
    confidence: 90,
    patterns: [
      /policy\s*schedule/i,
      /policy\s*period/i,
      /sum\s*insured/i,
      /new\s*india\s*(?:assurance|mediclaim)/i,
      /niahlip|nianp/i,
      /previous\s*policy\s*(?:no|number|period)/i,
      /policyholder['\'s\s]*(?:name|details?)/i,
      /insured\s*persons?\s*details?/i,
    ],
  },
  {
    type: 'insurance card',
    confidence: 85,
    patterns: [/insurance/i, /policy/i, /member/i, /card/i, /id\s*(?:number|no|#)/i, /group/i, /tpa/i, /third\s*party/i, /administrator/i, /health\s*card/i],
  },
  {
    type: 'preauth',
    confidence: 85,
    patterns: [/pre[-\s]?auth/i, /authorization/i, /cashless/i, /request/i, /approval/i, /claim\s*form/i, /claimant/i, /reimbursement/i, /part\s*[ab]/i, /declaration/i],
  },
  {
    type: 'invoice',
    confidence: 80,
    patterns: [
      /invoice/i,
      /bill/i,
      /itemi[sz]ed/i,
      /total/i,
      /amount/i,
      /charges?/i,
      /qty|quantity/i,
      /rate/i,
      /final\s*bill/i,
      /grand\s*total/i,
      /net\s*amount/i,
      /receipt/i,
      /settlement/i
    ],
  },
  {
    type: 'discharge summary',
    confidence: 85,
    patterns: [
      /discharge/i,
      /summary/i,
      /admission/i,
      /course/i,
      /history/i,
      /diagnosis/i,
      /treatment/i,
    ],
  },
  {
    type: 'prescription',
    confidence: 85,
    patterns: [/prescription/i, /rx/i, /medicine/i, /advised/i, /dosage/i, /pharmacy/i],
  },
  {
    type: 'lab report',
    confidence: 85,
    patterns: [
      /lab/i,
      /report/i,
      /pathology/i,
      /specimen/i,
      /reference\s*range/i,
      /test/i,
      /result/i,
      /radiology/i,
      /mri/i,
      /ct\s*scan/i,
      /x[-\s]?ray/i,
      /ultrasound/i,
      /scan/i,
      /imaging/i
    ],
  },
  {
    type: 'ID proof',
    confidence: 96,
    patterns: [/aadhaar/i, /\b\d{4}\s*[\s-]?\s*\d{4}\s*[\s-]?\s*\d{4}\b/, /pan\s*card/i, /income\s*tax/i, /\b[a-z]{5}\d{4}[a-z]\b/i, /id\s*proof/i, /identity/i, /passport/i, /driving\s*licence/i],
  },
  {
    type: 'clinical note',
    confidence: 80,
    patterns: [/doctor/i, /notes?/i, /progress/i, /clinical/i, /consultation/i, /observations?/i, /clinical\s*note/i],
  },
  {
    type: 'diagnosis',
    confidence: 80,
    patterns: [/diagnosis\s*sheet/i, /dx/i, /icd[- ]?10/i, /medical\s*condition/i, /diagnosis/i],
  },
  {
    type: 'UB04',
    confidence: 90,
    patterns: [/ub[-\s]?04/i, /cms[-\s]?1450/i, /revenue\s*code/i, /locator/i],
  },
];

export function classifyPages(pages: PageText[]): ClassifiedPage[] {
  logger.info('CLASSIFICATION', `Classifying ${pages.length} pages`);

  try {
    return pages.map((page) => {
      const normalized = normalizeWhitespace(page.text.toLowerCase());

      if (!normalized || normalized.length < 20) {
        return {
          page: page.page,
          type: 'unknown' as PageDocType,
          confidence: 0,
        };
      }

      const matchLogs: any[] = [];
      const matches = classifiers
        .map((classifier) => {
          const hitPatterns = classifier.patterns.filter((pattern) => {
            pattern.lastIndex = 0;
            return pattern.test(normalized);
          });

          if (hitPatterns.length > 0) {
            matchLogs.push({ type: classifier.type, hits: hitPatterns.map((p) => p.source) });
          }

          return {
            type: classifier.type,
            score: hitPatterns.length > 0 ? classifier.confidence + hitPatterns.length * 8 : 0,
          };
        })
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score);

      const best = matches[0];
      const result: ClassifiedPage = {
        page: page.page,
        type: (best?.type || 'unknown') as PageDocType,
        confidence: best ? clamp(best.score, 45, 99) : 0,
      };

      if (matchLogs.length > 0) {
        logger.classifierHits(page.page, matchLogs);
      }
      logger.chosenDocType(page.page, result.type, result.confidence);

      return result;
    });
  } catch (error) {
    logger.error('CLASSIFICATION', 'Page classification failed', error);
    throw new Error('Page classification failed.');
  }
}
