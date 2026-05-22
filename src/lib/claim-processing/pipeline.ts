import { ClaimPacket, PageText, ClaimSession } from './types';
import { extractPdfTextFirst } from './pdf';
import { runOcrFallback } from './ocr';
import { classifyPages } from './classification';
import { extractEntities } from './extraction';
import { validateExtractedData } from './validation';
import { calculateScores } from './scoring';
import { saveClaimState } from './db';
import { logger } from './logger';

export async function processClaimPipeline(
  buffer: Buffer,
  session: ClaimSession
): Promise<ClaimPacket> {
  const { claimId } = session;
  logger.info('PIPELINE', `Starting pipeline for claim ${claimId}`);

  try {
    await saveClaimState(claimId, 'PROCESSING');

    // 1. Text Extraction
    const { pageCount, pages: pdfPages, source } = await extractPdfTextFirst(buffer);
    logger.info('PIPELINE', `Extracted text from ${pageCount} pages using ${source}`);

    let finalPages: PageText[] = pdfPages;
    let extractionMethod: 'pdf_text' | 'ocr' | 'mixed' = 'pdf_text';
    let ocrConfidence = 0;

    // Check if we need OCR
    const totalTextLength = pdfPages.reduce((sum, p) => sum + p.text.length, 0);
    if (totalTextLength < 180) {
      logger.info('PIPELINE', `Low text length (${totalTextLength} chars). Falling back to OCR.`);
      const ocrPages = await runOcrFallback(buffer, pageCount);
      finalPages = ocrPages;
      extractionMethod = 'ocr';
      ocrConfidence = Math.round(ocrPages.reduce((sum, p) => sum + p.confidence, 0) / pageCount);
    } else {
      ocrConfidence = Math.round(pdfPages.reduce((sum, p) => sum + p.confidence, 0) / pageCount);
    }

    await saveClaimState(claimId, 'OCR_COMPLETE', { ocrConfidence });

    // 2. Classification
    const classifiedPages = classifyPages(finalPages);
    await saveClaimState(claimId, 'CLASSIFIED', { classifiedPages });

    // 3. Entity Extraction
    const extractedFields = extractEntities(finalPages, classifiedPages);

    // 4. Validation
    const { errors: validationErrors, repairSuggestions } = validateExtractedData(
      extractedFields,
      pageCount
    );

    // 5. Scoring
    const { claimHealth, readiness, rejectionRisk } = calculateScores(
      extractedFields,
      validationErrors,
      ocrConfidence
    );

    // 6. Final State Update
    const nextState = claimHealth >= 80 && readiness === 100 ? 'READY' : 'REVIEW_REQUIRED';

    await saveClaimState(claimId, nextState, {
      extractedFields,
      validationErrors,
      repairSuggestions,
      claimHealth,
      readiness,
      ocrConfidence,
    });

    const packet: ClaimPacket = {
      success: true,
      extractionMethod,
      claimId,
      uploadSessionId: session.uploadSessionId,
      pageCount,
      classifiedPages,
      extractedFields,
      validationErrors,
      claimHealth,
      readiness,
      ocrConfidence,
      rejectionRisk,
      repairSuggestions,
      intake: session,
      pdfType: source === 'pdf_parse' ? 'text_layer' : 'scanned_or_image',
      state: nextState,
    };

    logger.info('PIPELINE', `Pipeline complete for claim ${claimId}. Status: ${nextState}`);
    return packet;
  } catch (error) {
    logger.error('PIPELINE', `Pipeline failed for claim ${claimId}`, error);
    throw error;
  }
}
