const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildClaimValidationPrompt } = require('./prompts');

const parseJsonResponse = (text = '') => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const moneyToNumber = (value = '') => {
  const parsed = Number.parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractAmounts = (text) =>
  [...text.matchAll(/(?:INR|Rs\.?|\$)?\s*([0-9][0-9,]{2,}(?:\.\d{1,2})?)/gi)]
    .map((match) => moneyToNumber(match[1]))
    .filter((amount) => amount > 0);

const makeIssue = ({ title, severity, confidence, evidence, recommendation, fieldPath }) => ({
  issue: { title, severity, confidence, evidence },
  repair: {
    title,
    severity,
    recommendation,
    fieldPath,
    autoFixAvailable: false,
  },
});

const runLocalClaimValidation = ({ claim, documents = [] }) => {
  const combinedText = documents
    .map((doc) => [doc.originalName, doc.documentType, doc.ocrText, JSON.stringify(doc.ocrFields || {})].join('\n'))
    .join('\n\n');
  const text = combinedText.toLowerCase();
  const allAmounts = extractAmounts(combinedText);
  const totalMatch = combinedText.match(
    /(?:total\s*(?:billed|bill|invoice|claim|amount|charges?)|grand\s*total|net\s*amount)\s*[:\-]?\s*(?:INR|Rs\.?|\$)?\s*([0-9,]+(?:\.\d{1,2})?)/i
  );
  const detectedTotal = moneyToNumber(totalMatch?.[1] || '');
  const lineSum = detectedTotal
    ? allAmounts.filter((amount) => amount !== detectedTotal).reduce((sum, amount) => sum + amount, 0)
    : 0;
  const missingDocuments = ['insurance', 'diagnosis', 'invoice'].filter((signal) => !text.includes(signal));
  const issuePairs = [];

  if (!hasAny(combinedText, [/\bDOB\b/i, /date\s+of\s+birth/i, /birth\s+date/i])) {
    issuePairs.push(
      makeIssue({
        title: 'Missing patient date of birth',
        severity: 'high',
        confidence: 93,
        evidence: 'No DOB or Date of Birth marker was found in extracted document text.',
        recommendation: 'Collect DOB from intake, ID, or patient demographics and update the claim.',
        fieldPath: 'patient.date_of_birth',
      })
    );
  }

  if (!hasAny(combinedText, [/diagnosis/i, /\b[A-Z]\d{2}(?:\.\d+)?\b/])) {
    issuePairs.push(
      makeIssue({
        title: 'Missing diagnosis',
        severity: 'critical',
        confidence: 92,
        evidence: 'No diagnosis label or ICD-10-like diagnosis code was extracted.',
        recommendation: 'Attach the diagnosis page or add the principal diagnosis before submission.',
        fieldPath: 'clinical.principal_diagnosis',
      })
    );
  }

  if (!hasAny(combinedText, [/signature/i, /signed\s+by/i, /e[-\s]?signed/i, /authorized\s+signature/i])) {
    issuePairs.push(
      makeIssue({
        title: 'Missing signature evidence',
        severity: 'high',
        confidence: 88,
        evidence: 'No signature, signed-by, or e-signature marker was detected.',
        recommendation: 'Upload a signed discharge summary, claim form, or authorization page.',
        fieldPath: 'documents.signature',
      })
    );
  }

  if (!hasAny(combinedText, [/(member|policy|insurance)\s*(id|number|no|#)/i, /\b(MEM|POL|INS)[-\s]?[A-Z0-9-]{6,}\b/i])) {
    issuePairs.push(
      makeIssue({
        title: 'Missing or incomplete insurance ID',
        severity: 'high',
        confidence: 90,
        evidence: 'No strong member ID, policy number, or insurance ID pattern was extracted.',
        recommendation: 'Verify the full insurance member or policy ID from the payer card.',
        fieldPath: 'insurance.member_id',
      })
    );
  }

  if (!detectedTotal) {
    issuePairs.push(
      makeIssue({
        title: 'Missing invoice total',
        severity: 'high',
        confidence: 89,
        evidence: 'No invoice, grand total, total billed, or net amount was extracted.',
        recommendation: 'Attach an itemized invoice with visible totals.',
        fieldPath: 'billing.total_billed_amount',
      })
    );
  } else if (lineSum > 0 && Math.abs(lineSum - detectedTotal) > Math.max(10, detectedTotal * 0.02)) {
    issuePairs.push(
      makeIssue({
        title: 'Invoice total mismatch',
        severity: 'high',
        confidence: 85,
        evidence: `Extracted line amounts sum to ${lineSum}, but total is ${detectedTotal}.`,
        recommendation: 'Reconcile invoice line items and resubmit corrected billing totals.',
        fieldPath: 'billing.line_items',
      })
    );
  }

  if (documents.some((doc) => (doc.ocrText || '').length < 250 || doc.ocrFields?.extractionMethod === 'ocr_required')) {
    issuePairs.push(
      makeIssue({
        title: 'Low-text or blurry scan detected',
        severity: 'medium',
        confidence: 86,
        evidence: 'One or more documents have very little extractable text or require OCR review.',
        recommendation: 'Upload a clearer scan or text-readable PDF.',
        fieldPath: 'documents.quality',
      })
    );
  }

  if (missingDocuments.length > 0) {
    issuePairs.push(
      makeIssue({
        title: 'Possible missing packet sections',
        severity: 'medium',
        confidence: 80,
        evidence: `Missing text signals: ${missingDocuments.join(', ')}.`,
        recommendation: 'Confirm the packet includes payer, clinical, and billing pages.',
        fieldPath: 'documents.completeness',
      })
    );
  }

  const issuesDetected = issuePairs.map((pair) => pair.issue);
  const repairSuggestions = issuePairs.map((pair) => pair.repair);
  const penalty = issuesDetected.reduce((sum, issue) => {
    if (issue.severity === 'critical') return sum + 24;
    if (issue.severity === 'high') return sum + 16;
    if (issue.severity === 'medium') return sum + 9;
    return sum + 4;
  }, 0);
  const textVolume = documents.reduce((sum, doc) => sum + (doc.ocrText || '').length, 0);
  const confidenceScore = clamp(55 + Math.min(30, textVolume / 250) - issuesDetected.length * 5);
  const score = clamp(100 - penalty);
  const failed = issuesDetected.some((issue) => issue.severity === 'critical');

  return {
    validationStatus: failed ? 'failed' : issuesDetected.length ? 'warning' : 'passed',
    confidenceScore,
    aiSummary: issuesDetected.length
      ? `${issuesDetected.length} claim-specific validation issue(s) found from extracted document content.`
      : 'No major blockers found from extracted document content.',
    issuesDetected,
    repairSuggestions,
    submissionReadiness: {
      score,
      ready: score >= 85 && issuesDetected.length === 0,
    },
  };
};

const normalizeAIResult = (result, fallback) => {
  if (!result || typeof result !== 'object') return fallback;
  return {
    validationStatus: result.validationStatus || fallback.validationStatus,
    confidenceScore: clamp(result.confidenceScore ?? fallback.confidenceScore),
    aiSummary: result.aiSummary || fallback.aiSummary,
    issuesDetected: Array.isArray(result.issuesDetected) ? result.issuesDetected : fallback.issuesDetected,
    repairSuggestions: Array.isArray(result.repairSuggestions)
      ? result.repairSuggestions
      : fallback.repairSuggestions,
    submissionReadiness: result.submissionReadiness || fallback.submissionReadiness,
  };
};

const runAIClaimValidation = async ({ claim, documents }) => {
  const provider = process.env.AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? 'openrouter' : 'local');
  const prompt = buildClaimValidationPrompt(claim, documents);
  const localResult = runLocalClaimValidation({ claim, documents });

  if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
    const openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:4028',
        'X-Title': 'InsureFlow AI',
      },
    });
    const response = await openrouter.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });
    return normalizeAIResult(parseJsonResponse(response.choices[0].message.content), localResult);
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });
    return normalizeAIResult(parseJsonResponse(response.choices[0].message.content), localResult);
  }

  if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return normalizeAIResult(parseJsonResponse(result.response.text()), localResult);
  }

  return localResult;
};

module.exports = { runAIClaimValidation, runLocalClaimValidation };
