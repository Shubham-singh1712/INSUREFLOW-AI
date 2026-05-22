import { PageText, ClassifiedPage, PageDocType } from './types';
import { normalizeWhitespace, clamp } from './utils';
import { logger } from './logger';

const classifiers: Array<{
  type: PageDocType;
  confidence: number;
  patterns: RegExp[];
}> = [
  {
    type: 'insurance_card',
    confidence: 85,
    patterns: [/insurance/i, /policy/i, /member/i, /card/i, /id\s*(?:number|no|#)/i, /group/i],
  },
  {
    type: 'tpa_card',
    confidence: 85,
    patterns: [/tpa/i, /third\s*party/i, /administrator/i, /health\s*card/i],
  },
  {
    type: 'aadhaar',
    confidence: 96,
    patterns: [/aadhaar/i, /\b\d{4}\s*[\s-]?\s*\d{4}\s*[\s-]?\s*\d{4}\b/],
  },
  {
    type: 'pan',
    confidence: 96,
    patterns: [/pan\s*card/i, /income\s*tax/i, /\b[a-z]{5}\d{4}[a-z]\b/i],
  },
  {
    type: 'preauth_form',
    confidence: 85,
    patterns: [/pre[-\s]?auth/i, /authorization/i, /cashless/i, /request/i, /approval/i],
  },
  {
    type: 'claim_form',
    confidence: 85,
    patterns: [/claim\s*form/i, /claimant/i, /reimbursement/i, /part\s*[ab]/i, /declaration/i],
  },
  {
    type: 'final_bill',
    confidence: 85,
    patterns: [/final\s*bill/i, /grand\s*total/i, /net\s*amount/i, /receipt/i, /settlement/i],
  },
  {
    type: 'invoice',
    confidence: 80,
    patterns: [/invoice/i, /bill/i, /itemi[sz]ed/i, /total/i, /amount/i, /charges?/i, /qty|quantity/i, /rate/i],
  },
  {
    type: 'discharge_summary',
    confidence: 85,
    patterns: [/discharge/i, /summary/i, /admission/i, /course/i, /history/i, /diagnosis/i, /treatment/i],
  },
  {
    type: 'prescription',
    confidence: 85,
    patterns: [/prescription/i, /rx/i, /medicine/i, /advised/i, /dosage/i, /pharmacy/i],
  },
  {
    type: 'lab_report',
    confidence: 85,
    patterns: [/lab/i, /report/i, /pathology/i, /specimen/i, /reference\s*range/i, /test/i, /result/i],
  },
  {
    type: 'radiology',
    confidence: 85,
    patterns: [/radiology/i, /mri/i, /ct\s*scan/i, /x[-\s]?ray/i, /ultrasound/i, /scan/i, /imaging/i],
  },
  {
    type: 'doctor_notes',
    confidence: 80,
    patterns: [/doctor/i, /notes?/i, /progress/i, /clinical/i, /consultation/i, /observations?/i],
  },
  {
    type: 'ub04',
    confidence: 90,
    patterns: [/ub[-\s]?04/i, /cms[-\s]?1450/i, /revenue\s*code/i, /locator/i],
  },
  {
    type: 'hospital_form',
    confidence: 70,
    patterns: [/hospital/i, /admission/i, /registration/i, /patient\s*details/i, /consent/i],
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
            matchLogs.push({ type: classifier.type, hits: hitPatterns.map(p => p.source) });
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
