import { PageText, ClassifiedPage, PageDocType } from './types';
import { normalizeWhitespace, clamp } from './utils';
import { logger } from './logger';

const classifiers: Array<{ // MODIFIED
  type: PageDocType; // MODIFIED
  confidence: number; // MODIFIED
  patterns: RegExp[]; // MODIFIED
}> = [ // MODIFIED
  { // MODIFIED
    type: 'insurance card', // MODIFIED
    confidence: 85, // MODIFIED
    patterns: [/insurance/i, /policy/i, /member/i, /card/i, /id\s*(?:number|no|#)/i, /group/i, /tpa/i, /third\s*party/i, /administrator/i, /health\s*card/i], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'preauth', // MODIFIED
    confidence: 85, // MODIFIED
    patterns: [/pre[-\s]?auth/i, /authorization/i, /cashless/i, /request/i, /approval/i, /claim\s*form/i, /claimant/i, /reimbursement/i, /part\s*[ab]/i, /declaration/i], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'invoice', // MODIFIED
    confidence: 80, // MODIFIED
    patterns: [ // MODIFIED
      /invoice/i, // MODIFIED
      /bill/i, // MODIFIED
      /itemi[sz]ed/i, // MODIFIED
      /total/i, // MODIFIED
      /amount/i, // MODIFIED
      /charges?/i, // MODIFIED
      /qty|quantity/i, // MODIFIED
      /rate/i, // MODIFIED
      /final\s*bill/i, // MODIFIED
      /grand\s*total/i, // MODIFIED
      /net\s*amount/i, // MODIFIED
      /receipt/i, // MODIFIED
      /settlement/i // MODIFIED
    ], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'discharge summary', // MODIFIED
    confidence: 85, // MODIFIED
    patterns: [ // MODIFIED
      /discharge/i, // MODIFIED
      /summary/i, // MODIFIED
      /admission/i, // MODIFIED
      /course/i, // MODIFIED
      /history/i, // MODIFIED
      /diagnosis/i, // MODIFIED
      /treatment/i, // MODIFIED
    ], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'prescription', // MODIFIED
    confidence: 85, // MODIFIED
    patterns: [/prescription/i, /rx/i, /medicine/i, /advised/i, /dosage/i, /pharmacy/i], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'lab report', // MODIFIED
    confidence: 85, // MODIFIED
    patterns: [ // MODIFIED
      /lab/i, // MODIFIED
      /report/i, // MODIFIED
      /pathology/i, // MODIFIED
      /specimen/i, // MODIFIED
      /reference\s*range/i, // MODIFIED
      /test/i, // MODIFIED
      /result/i, // MODIFIED
      /radiology/i, // MODIFIED
      /mri/i, // MODIFIED
      /ct\s*scan/i, // MODIFIED
      /x[-\s]?ray/i, // MODIFIED
      /ultrasound/i, // MODIFIED
      /scan/i, // MODIFIED
      /imaging/i // MODIFIED
    ], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'ID proof', // MODIFIED
    confidence: 96, // MODIFIED
    patterns: [/aadhaar/i, /\b\d{4}\s*[\s-]?\s*\d{4}\s*[\s-]?\s*\d{4}\b/, /pan\s*card/i, /income\s*tax/i, /\b[a-z]{5}\d{4}[a-z]\b/i, /id\s*proof/i, /identity/i, /passport/i, /driving\s*licence/i], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'clinical note', // MODIFIED
    confidence: 80, // MODIFIED
    patterns: [/doctor/i, /notes?/i, /progress/i, /clinical/i, /consultation/i, /observations?/i, /clinical\s*note/i], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'diagnosis', // MODIFIED
    confidence: 80, // MODIFIED
    patterns: [/diagnosis\s*sheet/i, /dx/i, /icd[- ]?10/i, /medical\s*condition/i, /diagnosis/i], // MODIFIED
  }, // MODIFIED
  { // MODIFIED
    type: 'UB04', // MODIFIED
    confidence: 90, // MODIFIED
    patterns: [/ub[-\s]?04/i, /cms[-\s]?1450/i, /revenue\s*code/i, /locator/i], // MODIFIED
  }, // MODIFIED
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
