import path from 'path';
import fs from 'fs';
import { ClaimPacket, PageText, ClaimSession, ClassifiedPage } from './types';
import { extractPdfTextFirst } from './pdf';
import { runOcrFallback } from './ocr';
import { classifyPages } from './classification';
import { extractEntities } from './extraction';
import { validateExtractedData } from './validation';
import { calculateScores } from './scoring';
import { saveClaimState } from './db';
import { logger } from './logger';
import { runPythonExtraction, runPythonOcr } from './python-bridge'; // updated: added runPythonOcr
import { buildDocumentChecklist, getDocumentChecklistErrors } from './document-checklist';

async function ensurePdfJsNodePolyfills() { // // MODIFIED
  if (globalThis.DOMMatrix && globalThis.ImageData && globalThis.Path2D) return; // // MODIFIED
  try { // // MODIFIED
    const canvas = await import('@napi-rs/canvas'); // // MODIFIED
    globalThis.DOMMatrix ||= canvas.DOMMatrix as typeof globalThis.DOMMatrix;
    globalThis.ImageData ||= canvas.ImageData as unknown as typeof globalThis.ImageData;
    globalThis.Path2D ||= canvas.Path2D as typeof globalThis.Path2D;
 // // MODIFIED
  } catch (error) { // // MODIFIED
    throw new Error('Canvas geometry polyfills could not be initialized.'); // // MODIFIED
  } // // MODIFIED
} // // MODIFIED

async function renderPdfPagesToPng(buffer: Buffer, claimId: string): Promise<string[]> { // // MODIFIED
  await ensurePdfJsNodePolyfills(); // // MODIFIED
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); // // MODIFIED
  const canvasModule = await import('@napi-rs/canvas'); // // MODIFIED
  const Canvas = canvasModule.Canvas; // // MODIFIED

  const tempDir = path.join('/tmp', 'temp_pages', claimId); // MODIFIED — use /tmp (only writable dir in serverless/Vercel)
  fs.mkdirSync(tempDir, { recursive: true }); // MODIFIED

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
  } as any);
  const document = await loadingTask.promise; // // MODIFIED
  const imagePaths: string[] = []; // // MODIFIED

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) { // // MODIFIED
    const page = await document.getPage(pageNumber); // // MODIFIED
    const viewport = page.getViewport({ scale: 1.7 }); // // MODIFIED
    const canvas = new Canvas(Math.ceil(viewport.width), Math.ceil(viewport.height)); // // MODIFIED
    const context = canvas.getContext('2d'); // // MODIFIED

    await page.render({ canvasContext: context as any, viewport }).promise;
    const imageBuffer = await canvas.toBuffer('image/png'); // // MODIFIED
    const imagePath = path.join(tempDir, `page_${pageNumber}.png`); // MODIFIED
    fs.writeFileSync(imagePath, imageBuffer); // // MODIFIED
    imagePaths.push(imagePath); // // MODIFIED
  } // // MODIFIED

  await document.destroy(); // // MODIFIED
  return imagePaths; // // MODIFIED
} // // MODIFIED

export async function processClaimPipeline( // // MODIFIED
  buffer: Buffer, // // MODIFIED
  session: ClaimSession // // MODIFIED
): Promise<ClaimPacket> { // // MODIFIED
  const { claimId } = session; // // MODIFIED
  logger.info('PIPELINE', `Starting pipeline for claim ${claimId}`); // // MODIFIED

  // Create writable temp folder — /tmp is the only writable dir on serverless (Vercel) // MODIFIED
  fs.mkdirSync(path.join('/tmp', 'temp_claims'), { recursive: true }); // MODIFIED

  // 0. Save original PDF for future reprocessing support // MODIFIED
  const savedPdfPath = path.join('/tmp', 'temp_claims', `${claimId}.pdf`); // MODIFIED — /tmp instead of scratch/
  fs.writeFileSync(savedPdfPath, buffer); // MODIFIED

  let renderedPngPaths: string[] = []; // // MODIFIED

  try { // // MODIFIED
    await saveClaimState(claimId, 'PROCESSING'); // // MODIFIED

    // Render pages to images // // MODIFIED
    try { // // MODIFIED
      renderedPngPaths = await renderPdfPagesToPng(buffer, claimId); // // MODIFIED
      logger.info('PIPELINE', `Successfully rendered ${renderedPngPaths.length} pages to PNG`); // // MODIFIED
    } catch (renderError) { // // MODIFIED
      logger.error('PIPELINE', `Failed to render PDF to PNG pages`, renderError); // // MODIFIED
    } // // MODIFIED

    // 1. Text Extraction — try native PDF text first
    const { pageCount, pages: pdfPages, source } = await extractPdfTextFirst(buffer);
    logger.info('PIPELINE', `Extracted text from ${pageCount} pages using ${source}`);

    let finalPages: PageText[] = pdfPages;
    let extractionMethod: 'pdf_text' | 'ocr' | 'mixed' = 'pdf_text';
    let ocrConfidence = 0;

    // Check if we need OCR (scanned / image-only PDF)
    const totalTextLength = pdfPages.reduce((sum, p) => sum + p.text.length, 0);
    if (totalTextLength < 180) {
      logger.info('PIPELINE', `Low text (${totalTextLength} chars) — PDF is scanned. Running OCR.`);

      // PRIMARY OCR PATH: Python + PyMuPDF + Tesseract (reliable — no browser canvas needed)
      let ocrSuccess = false;
      try {
        logger.info('PIPELINE', 'Attempting Python OCR (PyMuPDF + Tesseract)...');
        const pyOcrPages = await runPythonOcr(savedPdfPath, 2.0);
        const pyTotalChars = pyOcrPages.reduce((s, p) => s + p.text.length, 0);
        logger.info('PIPELINE', `Python OCR produced ${pyTotalChars} total chars`);

        if (pyTotalChars > 50) {
          finalPages = pyOcrPages;
          extractionMethod = 'ocr';
          ocrConfidence = Math.round(
            pyOcrPages.reduce((sum, p) => sum + p.confidence, 0) / Math.max(pyOcrPages.length, 1)
          );
          ocrSuccess = true;
          logger.info('PIPELINE', `Python OCR succeeded. Avg confidence: ${ocrConfidence}%`);
        } else {
          logger.warn('PIPELINE', 'Python OCR returned <50 chars — falling back to JS OCR.');
        }
      } catch (pyOcrErr: any) {
        logger.warn('PIPELINE', `Python OCR failed: ${pyOcrErr.message}. Falling back to JS OCR.`);
      }

      // FALLBACK OCR PATH: Tesseract.js (may fail in Next.js but worth trying)
      if (!ocrSuccess) {
        try {
          logger.info('PIPELINE', 'Attempting JS Tesseract.js OCR fallback...');
          const ocrPages = await runOcrFallback(buffer, pageCount);
          const jsTotalChars = ocrPages.reduce((s, p) => s + p.text.length, 0);
          if (jsTotalChars > 50) {
            finalPages = ocrPages;
            extractionMethod = 'ocr';
            ocrConfidence = Math.round(ocrPages.reduce((sum, p) => sum + p.confidence, 0) / pageCount);
            logger.info('PIPELINE', `JS OCR fallback succeeded: ${jsTotalChars} chars`);
          } else {
            logger.warn('PIPELINE', 'JS OCR also returned <50 chars. Proceeding with empty text.');
          }
        } catch (jsOcrErr: any) {
          logger.warn('PIPELINE', `JS OCR fallback also failed: ${jsOcrErr.message}. Proceeding with no OCR text.`);
        }
      }
    } else {
      ocrConfidence = Math.round(pdfPages.reduce((sum, p) => sum + p.confidence, 0) / pageCount);
    }

    await saveClaimState(claimId, 'OCR_COMPLETE', { ocrConfidence }); // // MODIFIED

    // 2. Classification // // MODIFIED
    const classifiedPages = classifyPages(finalPages); // // MODIFIED
    await saveClaimState(claimId, 'CLASSIFIED', { classifiedPages }); // // MODIFIED

    // 3. Entity Extraction (Primary Python OCR/LLM path) // // MODIFIED
    let extractedFields: any = null; // // MODIFIED
    let pythonExtracted = false; // // MODIFIED
    let pyErr: any = null; // // MODIFIED

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

    // Fallback: If python fails or has no page images, run standard JS regex-heavy extraction // // MODIFIED
    if (!pythonExtracted) { // // MODIFIED
      logger.info('PIPELINE', 'Running JS Regex-heavy fallback extraction'); // // MODIFIED
      extractedFields = extractEntities(finalPages, classifiedPages); // // MODIFIED
    } // // MODIFIED

    await saveClaimState(claimId, 'OCR_COMPLETE' as any, { extractedFields });

    // 4. Validation
    const { errors: validationErrors, repairSuggestions } = validateExtractedData(
      extractedFields,
      pageCount
    );

    // 4b. Document Checklist — detect presence of mandatory supporting documents
    const documentChecklist = buildDocumentChecklist(finalPages);
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
    const nextState = claimHealth >= 80 && readiness === 100 ? 'READY' : 'REVIEW_REQUIRED'; // // MODIFIED

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
