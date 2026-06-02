const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const ApiError = require('../utils/ApiError');
const { recordValidationLog } = require('./validationLog.service');
const { capabilities } = require('../utils/capabilities');

const getTesseractOptions = () => ({
  workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'),
  corePath: path.dirname(require.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js')),
  langPath: path.dirname(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')),
  gzip: true,
  cacheMethod: 'none',
  workerBlobURL: false,
});

const extractFieldsFromText = (text = '') => {
  const patientName = text.match(/(?:patient|name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i)?.[1];
  const insuranceNumber = text.match(/(?:policy|member|insurance)\s*(?:no|number|id)?[:\s#-]+([A-Z0-9-]{6,})/i)?.[1];
  const dates = [...text.matchAll(/\b\d{2}[/-]\d{2}[/-]\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  const diagnosis = text.match(/diagnosis[:\s]+([^\n\r]+)/i)?.[1];
  const procedureCodes = [...text.matchAll(/\b(?:CPT|ICD|HCPCS)?\s*([A-Z]?\d{2,5}(?:\.\d+)?)\b/g)]
    .map((match) => match[1])
    .slice(0, 10);
  const doctorNames = [...text.matchAll(/Dr\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g)].map((match) => match[0]);

  return { patientName, insuranceNumber, dates, diagnosis, procedureCodes, doctorNames };
};

const runOcrExtraction = async ({ documentId, claimId, user }) => {
  const document = await Document.findById(documentId);
  if (!document) throw new ApiError(404, 'Document not found.');

  document.ocrStatus = 'processing';
  await document.save();

  let text = '';
  let ocrMetadata = {};
  const source = document.localPath || document.url;

  try {
    if (document.mimeType === 'application/pdf') {
      if (!document.localPath) {
        throw new ApiError(422, 'PDF text extraction requires a locally stored PDF file.');
      }

      if (capabilities.pdf_text_available) {
        const pdfParse = require('pdf-parse');
        let parsed;
        try {
          parsed = await pdfParse(fs.readFileSync(document.localPath));
          text = parsed.text || '';
          ocrMetadata = {
            extractionMethod: text.trim() ? 'pdf_text_layer' : 'ocr_required',
            pageCount: parsed.numpages || 1,
            extractedCharacters: text.length,
          };
        } catch (err) {
            console.error("PDF Parse error", err);
            ocrMetadata = {
              extractionMethod: 'metadata_only',
              ocrSkippedReason: 'pdf_parse_failed',
              error: err.message
            };
        }
      } else {
        ocrMetadata = {
          extractionMethod: 'metadata_only',
          ocrSkippedReason: 'pdf_text_capability_missing',
        };
      }
      
      // Scanned PDFs: To be implemented in next step if required. For now, text layer extraction is done.
      if(ocrMetadata.extractionMethod === 'ocr_required' || ocrMetadata.extractionMethod === 'metadata_only') {
          // If text is empty or extraction failed, maybe we need OCR.
          if(capabilities.ocr_available && capabilities.pdf_render_available && capabilities.canvas_available) {
               // Implement PDF to Image to OCR flow here
               ocrMetadata.ocrSkippedReason = "scanned_pdf_ocr_not_implemented_yet";
          } else {
               ocrMetadata.ocrSkippedReason = "ocr_or_render_capabilities_missing";
          }
      }

    } else {
      if (capabilities.ocr_available) {
        const Tesseract = require('tesseract.js');
        const result = await Tesseract.recognize(source, 'eng', getTesseractOptions());
        text = result.data.text;
        ocrMetadata = {
          extractionMethod: 'tesseract_ocr',
          confidence: result.data.confidence,
          extractedCharacters: text.length,
        };
      } else {
        ocrMetadata = {
          extractionMethod: 'metadata_only',
          ocrSkippedReason: 'ocr_capability_missing',
        };
      }
    }

    document.ocrText = text;
    document.ocrFields = { ...extractFieldsFromText(text), ...ocrMetadata };
    document.ocrStatus = 'completed';
    await document.save();

    if (claimId) {
      await recordValidationLog({
        claim: claimId,
        document: document._id,
        actor: user._id,
        type: 'ocr',
        status: ocrMetadata.ocrSkippedReason ? 'warning' : 'passed',
        message: ocrMetadata.ocrSkippedReason ? `Extraction partial: ${ocrMetadata.ocrSkippedReason}` : 'OCR extraction completed.',
        metadata: document.ocrFields,
      });
    }

    return {
      document,
      extractedText: text,
      structuredFields: document.ocrFields,
      skippedReason: ocrMetadata.ocrSkippedReason
    };
  } catch (error) {
    document.ocrStatus = 'failed';
    await document.save();
    
    if (claimId) {
      await recordValidationLog({
        claim: claimId,
        document: document._id,
        actor: user._id,
        type: 'ocr',
        status: 'failed',
        message: `OCR extraction failed: ${error.message}`,
      });
    }
    throw error;
  }
};

module.exports = { runOcrExtraction, extractFieldsFromText };
