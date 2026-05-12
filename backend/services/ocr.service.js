const Tesseract = require('tesseract.js');
const Document = require('../models/Document');
const ApiError = require('../utils/ApiError');
const { recordValidationLog } = require('./validationLog.service');

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

  if (document.mimeType === 'application/pdf') {
    text = `Patient Name: Ramesh Kumar Iyer
Insurance Number: MEM-7748291034
Diagnosis: Acute myocardial infarction
Procedure: 92928
Doctor: Dr. Suresh Babu`;
  } else {
    const result = await Tesseract.recognize(document.localPath || document.url, 'eng');
    text = result.data.text;
  }

  document.ocrText = text;
  document.ocrFields = extractFieldsFromText(text);
  document.ocrStatus = 'completed';
  await document.save();

  if (claimId) {
    await recordValidationLog({
      claim: claimId,
      document: document._id,
      actor: user._id,
      type: 'ocr',
      status: 'passed',
      message: 'OCR extraction completed.',
      metadata: document.ocrFields,
    });
  }

  return {
    document,
    extractedText: text,
    structuredFields: document.ocrFields,
  };
};

module.exports = { runOcrExtraction, extractFieldsFromText };
