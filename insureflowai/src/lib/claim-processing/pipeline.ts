import path from 'path';
import fs from 'fs';
import { ClaimPacket, PageText, ClaimSession, ClassifiedPage } from './types';
import { extractPdfTextFirst } from './pdf';
import { classifyPages } from './classification';
import { extractEntities } from './extraction';
import { validateExtractedData } from './validation';
import { calculateScores } from './scoring';
import { saveClaimState } from './db';
import { logger } from './logger';
import { runPythonExtraction } from './python-bridge';
import { runOcrWorkerSubprocess, runLlmExtraction } from './node-bridge';
import { buildDocumentChecklist, getDocumentChecklistErrors } from './document-checklist';
import { calculateLifecycleStatus } from '@/lib/claimLifecycle';

export async function processClaimPipeline(
  buffer: Buffer,
  session: ClaimSession
): Promise<ClaimPacket> {
  const { claimId } = session;
  logger.info('PIPELINE', `Starting pipeline for claim ${claimId}`);

  // Create writable temp folder — /tmp is the only writable dir on serverless (Vercel)
  fs.mkdirSync(path.join('/tmp', 'temp_claims'), { recursive: true });

  // 0. Save original PDF for future reprocessing support
  const savedPdfPath = path.join('/tmp', 'temp_claims', `${claimId}.pdf`);
  fs.writeFileSync(savedPdfPath, buffer);

  let renderedPngPaths: string[] = [];

  try {
    await saveClaimState(claimId, 'PROCESSING');

    // 1. Text Extraction — try native PDF text first
    const { pageCount, pages: pdfPages, source } = await extractPdfTextFirst(buffer);
    logger.info('PIPELINE', `Extracted text from ${pageCount} pages using ${source}`);

    let finalPages: PageText[] = pdfPages;
    let extractionMethod: 'pdf_text' | 'ocr' | 'mixed' = 'pdf_text';
    let ocrConfidence = 0;

    // Check if we need OCR (scanned / image-only PDF)
    const totalTextLength = pdfPages.reduce((sum, p) => sum + p.text.length, 0);
    const runOcr = totalTextLength < 180;

    if (runOcr) {
      logger.info('PIPELINE', `Low text (${totalTextLength} chars) — PDF is scanned. Running OCR.`);
    } else {
      logger.info('PIPELINE', `Sufficient text (${totalTextLength} chars) — PDF has text layer. Skipping OCR, only rendering pages.`);
    }

    const tempPagesDir = path.join('/tmp', 'temp_pages', claimId);
    fs.mkdirSync(tempPagesDir, { recursive: true });

    try {
      // Execute the unified rendering / OCR subprocess
      const ocrResult = await runOcrWorkerSubprocess(savedPdfPath, tempPagesDir, runOcr);

      // Populate renderedPngPaths
      renderedPngPaths = Array.from({ length: ocrResult.page_count }, (_, index) =>
        path.join(tempPagesDir, `page_${index + 1}.png`)
      );
      logger.info('PIPELINE', `Rendered ${renderedPngPaths.length} pages to PNG via PyMuPDF subprocess`);

      if (runOcr) {
        finalPages = ocrResult.pages.map((p) => ({
          page: p.page,
          text: p.text,
          method: 'ocr' as const,
          confidence: p.confidence,
        }));
        extractionMethod = 'ocr';
        ocrConfidence = Math.round(
          ocrResult.pages.reduce((sum, p) => sum + p.confidence, 0) / Math.max(ocrResult.pages.length, 1)
        );
        logger.info('PIPELINE', `OCR completed successfully. Avg confidence: ${ocrConfidence}%`);
      } else {
        ocrConfidence = Math.round(pdfPages.reduce((sum, p) => sum + p.confidence, 0) / pageCount);
      }
    } catch (ocrErr: any) {
      logger.error('PIPELINE', `Unified rendering/OCR subprocess failed: ${ocrErr.message}`);
      // Fallback: if rendering/OCR fails, we still have pdfPages, and we can proceed with empty png paths
      renderedPngPaths = [];
      ocrConfidence = 0;
    }

    await saveClaimState(claimId, 'OCR_COMPLETE', { ocrConfidence }); // // MODIFIED

    // 2. Classification // // MODIFIED
    const classifiedPages = classifyPages(finalPages); // // MODIFIED
    await saveClaimState(claimId, 'CLASSIFIED', { classifiedPages }); // // MODIFIED

    // 3. Entity Extraction (Primary Python OCR/LLM path) // // MODIFIED
    let extractedFields: any = null; // // MODIFIED
    let pythonExtracted = false; // // MODIFIED
    let pyErr: any = null; // // MODIFIED
    let llmResult: any = null;

    if (renderedPngPaths.length > 0) { // // MODIFIED
      // Identify primary form page. Check for page classified as preauth or UB04. // // MODIFIED
      let formPageNumber = 1; // // MODIFIED
      const formPage = classifiedPages.find(p => p.type === 'preauth' || p.type === 'UB04'); // // MODIFIED
      if (formPage) { // // MODIFIED
        formPageNumber = formPage.page; // // MODIFIED
      } // // MODIFIED

      const primaryPngPath = renderedPngPaths[formPageNumber - 1] || renderedPngPaths[0]; // // MODIFIED

      try { // // MODIFIED
        logger.info('PIPELINE', `Invoking Python Form Segmenter pipeline on ${path.basename(primaryPngPath)}`); // // MODIFIED
        const pyResult = await runPythonExtraction(primaryPngPath); // // MODIFIED
        extractedFields = extractEntities(finalPages, classifiedPages, pyResult); // // MODIFIED
        pythonExtracted = true; // // MODIFIED
        logger.info('PIPELINE', 'Python segmenter extraction completed successfully'); // // MODIFIED
      } catch (err: any) { // // MODIFIED
        pyErr = err; // // MODIFIED
        logger.warn('PIPELINE', `Python pipeline execution failed: ${err.message || err}. Falling back to JS regex extraction.`); // // MODIFIED
      } // // MODIFIED
    } // // MODIFIED

    // Fallback: If python fails, run Direct Gemini LLM extraction, then fall back to Regex
    if (!pythonExtracted) {
      let llmExtractionSuccess = false;
      try {
        const combinedText = finalPages.map((p) => p.text).join('\n\n');
        if (combinedText.trim().length > 30) {
          logger.info('PIPELINE', 'Running Direct Gemini LLM fallback extraction...');
          llmResult = await runLlmExtraction(combinedText);
          extractedFields = extractEntities(finalPages, classifiedPages, llmResult);
          llmExtractionSuccess = true;
          extractionMethod = 'ocr';
          logger.info('PIPELINE', 'Direct Gemini LLM fallback extraction completed successfully');
        }
      } catch (llmErr: any) {
        logger.error(
          'PIPELINE',
          `Direct Gemini LLM fallback extraction failed: ${llmErr.message}. Falling back to Regex-heavy extraction.`
        );
      }

      if (!llmExtractionSuccess) {
        logger.info('PIPELINE', 'Running JS Regex-heavy fallback extraction');
        extractedFields = extractEntities(finalPages, classifiedPages);
      }
    }

    await saveClaimState(claimId, 'EXTRACTED', { extractedFields });

    // 4. Validation
    const { errors: validationErrors, repairSuggestions } = validateExtractedData(
      extractedFields,
      pageCount
    );

    // 4b. Document Checklist — detect presence of mandatory supporting documents
    const documentChecklist = buildDocumentChecklist(finalPages, llmResult);
    const docErrors = getDocumentChecklistErrors(documentChecklist);
    // Merge document errors into validation errors (only add if not already present)
    for (const docErr of docErrors) {
      if (!validationErrors.some((e) => e.field === docErr.field)) {
        validationErrors.push(docErr);
      }
    }
    logger.info(
      'PIPELINE',
      `Document checklist: ${documentChecklist.items.filter((i) => i.present).length}/${documentChecklist.items.length} docs found. Missing required: [${documentChecklist.missingRequired.join(', ')}]`
    );

    // 5. Scoring // // MODIFIED
    const { claimHealth, readiness, extractionConfidence, rejectionRisk } = calculateScores( // // MODIFIED
      extractedFields, // // MODIFIED
      validationErrors, // // MODIFIED
      ocrConfidence // // MODIFIED
    ); // // MODIFIED

    // 6. Final State Update // // MODIFIED
    const nextState = calculateLifecycleStatus({
      validationIssueCount: validationErrors.length,
      readinessScore: readiness,
      threshold: 0,
    });

    await saveClaimState(claimId, nextState, { // // MODIFIED
      extractedFields, // // MODIFIED
      validationErrors, // // MODIFIED
      repairSuggestions, // // MODIFIED
      claimHealth, // // MODIFIED
      readiness, // // MODIFIED
      ocrConfidence, // // MODIFIED
    }); // // MODIFIED

    const packet: ClaimPacket = {
      success: true,
      extractionMethod: pythonExtracted ? 'mixed' : extractionMethod,
      claimId,
      uploadSessionId: session.uploadSessionId,
      pageCount,
      classifiedPages,
      extractedFields,
      validationErrors,
      claimHealth,
      readiness,
      ocrConfidence,
      extractionConfidence,
      rejectionRisk,
      repairSuggestions,
      intake: session,
      pdfType: source === 'pdf_parse' ? 'text_layer' : 'scanned_or_image',
      state: nextState,
      documentChecklist, // NEW — mandatory supporting document presence report
    };

    logger.info('PIPELINE', `Pipeline complete for claim ${claimId}. Status: ${nextState}`); // // MODIFIED
    return packet; // // MODIFIED
  } catch (error) { // // MODIFIED
    logger.error('PIPELINE', `Pipeline failed for claim ${claimId}`, error); // // MODIFIED
    throw error; // // MODIFIED
  } finally { // // MODIFIED
    // Clean up temporary rendered PNG page images // // MODIFIED
    if (renderedPngPaths.length > 0) { // // MODIFIED
      try { // // MODIFIED
        const tempDir = path.join('/tmp', 'temp_pages', claimId); // MODIFIED — /tmp instead of scratch/
        if (fs.existsSync(tempDir)) { // // MODIFIED
          fs.rmSync(tempDir, { recursive: true, force: true }); // // MODIFIED
          logger.info('PIPELINE', `Cleaned up rendered temp folder for claim ${claimId}`); // // MODIFIED
        } // // MODIFIED
      } catch (cleanupErr) { // // MODIFIED
        logger.warn('PIPELINE', 'Failed to clean up temp page folder', cleanupErr); // // MODIFIED
      } // // MODIFIED
    } // // MODIFIED
  } // // MODIFIED
} // // MODIFIED
