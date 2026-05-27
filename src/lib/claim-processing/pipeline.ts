import path from 'path'; // // MODIFIED
import fs from 'fs'; // // MODIFIED
import { ClaimPacket, PageText, ClaimSession, ClassifiedPage } from './types'; // // MODIFIED
import { extractPdfTextFirst } from './pdf'; // // MODIFIED
import { runOcrFallback } from './ocr'; // // MODIFIED
import { classifyPages } from './classification'; // // MODIFIED
import { extractEntities } from './extraction'; // // MODIFIED
import { validateExtractedData } from './validation'; // // MODIFIED
import { calculateScores } from './scoring'; // // MODIFIED
import { saveClaimState } from './db'; // // MODIFIED
import { logger } from './logger'; // // MODIFIED
import { runPythonExtraction } from './python-bridge'; // // MODIFIED

async function ensurePdfJsNodePolyfills() { // // MODIFIED
  if (globalThis.DOMMatrix && globalThis.ImageData && globalThis.Path2D) return; // // MODIFIED
  try { // // MODIFIED
    const canvas = await import('@napi-rs/canvas'); // // MODIFIED
    globalThis.DOMMatrix ||= canvas.DOMMatrix as typeof globalThis.DOMMatrix; // // MODIFIED
    globalThis.ImageData ||= canvas.ImageData as typeof globalThis.ImageData; // // MODIFIED
    globalThis.Path2D ||= canvas.Path2D as typeof globalThis.Path2D; // // MODIFIED
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

  const loadingTask = pdfjs.getDocument({ // // MODIFIED
    data: new Uint8Array(buffer), // // MODIFIED
    disableWorker: true, // // MODIFIED
    useSystemFonts: true, // // MODIFIED
  }); // // MODIFIED
  const document = await loadingTask.promise; // // MODIFIED
  const imagePaths: string[] = []; // // MODIFIED

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) { // // MODIFIED
    const page = await document.getPage(pageNumber); // // MODIFIED
    const viewport = page.getViewport({ scale: 1.7 }); // // MODIFIED
    const canvas = new Canvas(Math.ceil(viewport.width), Math.ceil(viewport.height)); // // MODIFIED
    const context = canvas.getContext('2d'); // // MODIFIED

    await page.render({ canvasContext: context, viewport }).promise; // // MODIFIED
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

    // 1. Text Extraction // // MODIFIED
    const { pageCount, pages: pdfPages, source } = await extractPdfTextFirst(buffer); // // MODIFIED
    logger.info('PIPELINE', `Extracted text from ${pageCount} pages using ${source}`); // // MODIFIED

    let finalPages: PageText[] = pdfPages; // // MODIFIED
    let extractionMethod: 'pdf_text' | 'ocr' | 'mixed' = 'pdf_text'; // // MODIFIED
    let ocrConfidence = 0; // // MODIFIED

    // Check if we need OCR // // MODIFIED
    const totalTextLength = pdfPages.reduce((sum, p) => sum + p.text.length, 0); // // MODIFIED
    if (totalTextLength < 180) { // // MODIFIED
      logger.info('PIPELINE', `Low text length (${totalTextLength} chars). Falling back to OCR.`); // // MODIFIED
      const ocrPages = await runOcrFallback(buffer, pageCount); // // MODIFIED
      finalPages = ocrPages; // // MODIFIED
      extractionMethod = 'ocr'; // // MODIFIED
      ocrConfidence = Math.round(ocrPages.reduce((sum, p) => sum + p.confidence, 0) / pageCount); // // MODIFIED
    } else { // // MODIFIED
      ocrConfidence = Math.round(pdfPages.reduce((sum, p) => sum + p.confidence, 0) / pageCount); // // MODIFIED
    } // // MODIFIED

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

    await saveClaimState(claimId, 'EXTRACTED', { extractedFields }); // // MODIFIED

    // 4. Validation // // MODIFIED
    const { errors: validationErrors, repairSuggestions } = validateExtractedData( // // MODIFIED
      extractedFields, // // MODIFIED
      pageCount // // MODIFIED
    ); // // MODIFIED

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

    const packet: ClaimPacket = { // // MODIFIED
      success: true, // // MODIFIED
      extractionMethod: pythonExtracted ? 'mixed' : extractionMethod, // // MODIFIED
      claimId, // // MODIFIED
      uploadSessionId: session.uploadSessionId, // // MODIFIED
      pageCount, // // MODIFIED
      classifiedPages, // // MODIFIED
      extractedFields, // // MODIFIED
      validationErrors, // // MODIFIED
      claimHealth, // // MODIFIED
      readiness, // // MODIFIED
      ocrConfidence, // // MODIFIED
      extractionConfidence, // // MODIFIED
      rejectionRisk, // // MODIFIED
      repairSuggestions, // // MODIFIED
      intake: session, // // MODIFIED
      pdfType: source === 'pdf_parse' ? 'text_layer' : 'scanned_or_image', // // MODIFIED
      state: nextState, // // MODIFIED
    }; // // MODIFIED

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
