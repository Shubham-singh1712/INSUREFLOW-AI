export const logger = {
  info: (stage: string, message: string, data?: any) => {
    console.log(`[INFO] [${stage}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  warn: (stage: string, message: string, data?: any) => {
    console.warn(`[WARN] [${stage}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (stage: string, message: string, error?: any) => {
    console.error(`[ERROR] [${stage}] ${message}`, error);
  },
  ocrPreview: (page: number, text: string) => {
    console.log(`[OCR_PREVIEW] Page ${page}: "${text.slice(0, 150).replace(/\n/g, ' ')}..."`);
  },
  classifierHits: (page: number, matches: any[]) => {
    console.log(`[CLASSIFIER] Page ${page} Hits:`, JSON.stringify(matches, null, 2));
  },
  chosenDocType: (page: number, docType: string, confidence: number) => {
    console.log(`[CLASSIFIER_RESULT] Page ${page} Type: ${docType} (Confidence: ${confidence}%)`);
  },
  extractedCandidate: (field: string, candidate: any, regexSource: string) => {
    console.log(`[EXTRACTION_CANDIDATE] ${field}:`, { ...candidate, regex: regexSource });
  },
  finalUiMapping: (fields: any[]) => {
    console.log(`[UI_MAPPING] Final UI Fields:`, JSON.stringify(fields, null, 2));
  }
};
