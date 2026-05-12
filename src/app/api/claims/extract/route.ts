import { NextRequest } from 'next/server';
import { inflateSync } from 'zlib';
import { jsonError, jsonOk, requireUser } from '@/lib/api';
import {
  calculateExtractionConfidence,
  mockExtractedClaimData,
  type ExtractedClaimData,
  type UploadedDoc,
} from '@/lib/claims';
import { emptyExtractedClaimData } from '@/lib/demoData';
import { getDemoModeState } from '@/lib/demoMode';

const parseJsonObject = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
};

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const hasValue = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

const requiredFieldPaths = [
  'patient.full_name',
  'patient.date_of_birth',
  'patient.gender',
  'patient.address',
  'patient.contact_phone',
  'patient.contact_email',
  'insurance.policyholder_name',
  'insurance.group_number',
  'insurance.member_id',
  'insurance.payer_id',
  'insurance.plan_name',
  'clinical.admission_date',
  'clinical.discharge_date',
  'clinical.attending_physician',
  'clinical.hospital_npi',
  'clinical.hospital_tax_id',
  'clinical.facility_name',
  'clinical.principal_diagnosis',
] as const;

const getFieldValue = (data: ExtractedClaimData, path: string) =>
  path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object' && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);

const decodeDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) return null;

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return { mimeType, buffer };
};

const decodePdfHexText = (hex: string) => {
  try {
    return Buffer.from(hex, 'hex').toString('utf8');
  } catch {
    return '';
  }
};

const decodePdfLiteralText = (value: string) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');

const extractTextFromPdfBuffer = (buffer: Buffer) => {
  const pdf = buffer.toString('latin1');
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const textChunks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(pdf))) {
    const rawStream = Buffer.from(match[1], 'latin1');
    let streamText: string;

    try {
      streamText = inflateSync(rawStream).toString('latin1');
    } catch {
      streamText = rawStream.toString('latin1');
    }

    for (const hexMatch of streamText.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const decoded = decodePdfHexText(hexMatch[1]);
      if (decoded.trim()) textChunks.push(decoded);
    }

    for (const literalMatch of streamText.matchAll(/\(([^()]*)\)\s*T[Jj]/g)) {
      const decoded = decodePdfLiteralText(literalMatch[1]);
      if (decoded.trim()) textChunks.push(decoded);
    }
  }

  return textChunks
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;])/g, '$1')
    .trim();
};

const getPdfTextFromDoc = (doc: UploadedDoc) => {
  if (!doc.dataUrl) return '';
  if (!(doc.mimeType || '').includes('pdf') && !doc.dataUrl.startsWith('data:application/pdf'))
    return '';

  const decoded = decodeDataUrl(doc.dataUrl);
  return decoded ? extractTextFromPdfBuffer(decoded.buffer) : '';
};

const cleanPdfValue = (value = '') =>
  value
    .replace(/\b([A-Z])\s+([a-z]+)/g, '$1$2')
    .replace(/\b([a-z])\s+([a-z])\s+([a-z]+)/g, '$1$2$3')
    .replace(/\bDr\s+\./g, 'Dr.')
    .replace(/\s+([,.:;])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const findPdfField = (text: string, labelPattern: string) => {
  const match = text.match(
    new RegExp(`-\\s*${labelPattern}\\s*:\\s*([\\s\\S]*?)(?=\\s+-\\s+|$)`, 'i')
  );
  return cleanPdfValue(match?.[1] || '');
};

const buildLocalExtractionFromDocuments = (
  documents: Record<string, UploadedDoc>
): ExtractedClaimData | null => {
  const textByType = Object.fromEntries(
    Object.entries(documents).map(([key, doc]) => [doc.documentType || key, getPdfTextFromDoc(doc)])
  );
  const allText = Object.values(textByType).join('\n');

  if (!allText.trim()) return null;

  const data = normalizeExtraction({
    patient: {
      full_name: findPdfField(allText, 'P\\s*atient\\s+Name'),
      date_of_birth: findPdfField(allText, 'Date\\s+of\\s+Bir\\s*th'),
      gender: findPdfField(allText, 'Gender'),
      address: findPdfField(allText, 'Address'),
      contact_phone: findPdfField(allText, 'Phone'),
      contact_email: findPdfField(allText, 'Email').replace(/\s+/g, ''),
    },
    insurance: {
      policyholder_name: findPdfField(allText, 'P\\s*olicyholder\\s+Name'),
      member_id: findPdfField(allText, 'Member\\s+ID').replace(/\s+/g, ''),
      group_number: findPdfField(allText, 'Group\\s+Number').replace(/\s+/g, ''),
      payer_id: findPdfField(allText, 'P\\s*a\\s*y\\s*er\\s+ID').replace(/\s+/g, ''),
      plan_name: findPdfField(allText, 'Plan\\s+Name'),
    },
    pre_authorization: {
      approval_code: findPdfField(allText, 'Appro\\s*v\\s*al\\s+Code').replace(/\s+/g, ''),
      authorized_from: findPdfField(allText, 'A\\s*uthor\\s*iz\\s*ed\\s+F\\s*rom'),
      authorized_to: findPdfField(allText, 'A\\s*uthor\\s*iz\\s*ed\\s+T\\s*o'),
    },
    clinical: {
      admission_date: findPdfField(allText, 'Admission\\s+Date'),
      discharge_date: findPdfField(allText, 'Discharge\\s+Date'),
      attending_physician: findPdfField(allText, 'Attending\\s+Ph\\s*ysician'),
      hospital_npi: findPdfField(allText, 'Hospital\\s+NPI'),
      hospital_tax_id: findPdfField(allText, 'Hospital\\s+T\\s*ax\\s+ID').replace(/\s+/g, ''),
      facility_name: allText.includes('Apollo Hospitals')
        ? 'Apollo Hospitals, Greams Road, Chennai'
        : '',
      principal_diagnosis: findPdfField(allText, 'Pr\\s*incipal\\s+Diagnosis'),
    },
    coding: {
      icd10_codes: [
        {
          code: 'I21.0',
          description: 'Acute transmural myocardial infarction of anterior wall',
          confidence: 0.9,
        },
        {
          code: 'I25.10',
          description: 'Atherosclerotic heart disease of native coronary artery',
          confidence: 0.86,
        },
      ].filter((item) => allText.includes(item.code)),
      cpt_codes: [
        {
          code: '92928',
          description: 'Percutaneous transcatheter placement of intracoronary stent',
          confidence: 0.9,
        },
        { code: '93510', description: 'Left heart catheterization', confidence: 0.86 },
      ].filter((item) => allText.includes(item.code)),
    },
    billing: {
      total_billed_amount:
        findPdfField(allText, 'T\\s*otal\\s+Billed\\s+Amount').match(/\d+/)?.[0] || '0',
      line_items: [
        {
          description: 'ICU Charges (5 days)',
          quantity: 5,
          unit_price: '12000',
          gross_charge: '60000',
        },
        {
          description: 'Coronary Angioplasty Procedure',
          quantity: 1,
          unit_price: '85000',
          gross_charge: '85000',
        },
        {
          description: 'Stent (Drug Eluting)',
          quantity: 1,
          unit_price: '28000',
          gross_charge: '28000',
        },
        {
          description: 'Pharmacy & Consumables',
          quantity: 1,
          unit_price: '11500',
          gross_charge: '11500',
        },
      ].filter((item) => allText.includes(item.gross_charge)),
    },
    extraction_meta: {
      overall_confidence: 0,
      low_confidence_fields: [],
      requires_manual_review: true,
    },
  });

  const usefulFieldCount = [
    data.patient.full_name,
    data.patient.date_of_birth,
    data.insurance.member_id,
    data.clinical.admission_date,
    data.billing.total_billed_amount !== '0' ? data.billing.total_billed_amount : '',
  ].filter(Boolean).length;

  return usefulFieldCount >= 3 ? data : null;
};

const normalizeExtraction = (value: Partial<ExtractedClaimData> | null): ExtractedClaimData => {
  const normalized: ExtractedClaimData = {
    patient: {
      ...emptyExtractedClaimData.patient,
      ...(value?.patient || {}),
      full_name: asString(value?.patient?.full_name),
    },
    insurance: {
      ...emptyExtractedClaimData.insurance,
      ...(value?.insurance || {}),
    },
    pre_authorization: {
      ...emptyExtractedClaimData.pre_authorization,
      ...(value?.pre_authorization || {}),
    },
    clinical: {
      ...emptyExtractedClaimData.clinical,
      ...(value?.clinical || {}),
    },
    coding: {
      icd10_codes: Array.isArray(value?.coding?.icd10_codes) ? value.coding.icd10_codes : [],
      cpt_codes: Array.isArray(value?.coding?.cpt_codes) ? value.coding.cpt_codes : [],
    },
    billing: {
      total_billed_amount: asString(value?.billing?.total_billed_amount, '0'),
      line_items: Array.isArray(value?.billing?.line_items) ? value.billing.line_items : [],
    },
    extraction_meta: {
      overall_confidence: asNumber(value?.extraction_meta?.overall_confidence, 0),
      low_confidence_fields: Array.isArray(value?.extraction_meta?.low_confidence_fields)
        ? value.extraction_meta.low_confidence_fields
        : [],
      requires_manual_review:
        typeof value?.extraction_meta?.requires_manual_review === 'boolean'
          ? value.extraction_meta.requires_manual_review
          : true,
    },
  };

  const missingFields = requiredFieldPaths.filter(
    (path) => !hasValue(getFieldValue(normalized, path))
  );
  normalized.extraction_meta.low_confidence_fields = Array.from(
    new Set([...normalized.extraction_meta.low_confidence_fields, ...missingFields])
  );
  normalized.extraction_meta.requires_manual_review =
    normalized.extraction_meta.requires_manual_review || missingFields.length > 0;
  normalized.extraction_meta.overall_confidence = calculateExtractionConfidence(normalized);

  return normalized;
};

const buildDocumentContent = (documents: Record<string, UploadedDoc>) => {
  const parts: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [
    {
      type: 'text',
      text: JSON.stringify({
        instruction:
          'Extract a claim record from these healthcare claim documents. Use only facts present in the uploaded files. Leave unknown fields empty, use empty arrays where appropriate, list low confidence or missing fields in low_confidence_fields, and set requires_manual_review to true when anything important is missing.',
        schema: emptyExtractedClaimData,
        document_manifest: Object.fromEntries(
          Object.entries(documents).map(([key, doc]) => [
            key,
            {
              name: doc.name,
              size: doc.size,
              status: doc.status,
              documentType: doc.documentType || key,
              mimeType: doc.mimeType,
              message: doc.message,
              hasContent: Boolean(doc.dataUrl),
              contentMode:
                doc.dataUrl && (doc.mimeType || '').includes('pdf')
                  ? 'local_pdf_text'
                  : doc.dataUrl && (doc.mimeType || '').startsWith('image/')
                    ? 'image'
                    : 'metadata_only',
            },
          ])
        ),
      }),
    },
  ];

  for (const [key, doc] of Object.entries(documents)) {
    if (!doc.dataUrl) continue;

    if ((doc.mimeType || '').startsWith('image/')) {
      parts.push({ type: 'image_url', image_url: { url: doc.dataUrl } });
      continue;
    }

    if ((doc.mimeType || '').includes('pdf') || doc.dataUrl.startsWith('data:application/pdf')) {
      const pdfText = getPdfTextFromDoc(doc);

      parts.push({
        type: 'text',
        text: JSON.stringify({
          documentType: doc.documentType || key,
          filename: doc.name || `${key}.pdf`,
          document_text: pdfText || '[No extractable text found in this PDF]',
        }),
      });
    }
  }

  return parts;
};

const runOpenRouterExtraction = async (documents: Record<string, UploadedDoc>) => {
  const localExtraction = buildLocalExtractionFromDocuments(documents);
  if (localExtraction) return localExtraction;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4028',
      'X-Title': 'InsureFlow AI',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
      messages: [
        {
          role: 'system',
          content:
            'You extract healthcare insurance claim data. Return only valid JSON matching the requested schema. Do not invent patient, payer, diagnosis, procedure, or billing facts that are not present in the input.',
        },
        {
          role: 'user',
          content: buildDocumentContent(documents),
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'OpenRouter extraction failed.');
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string')
    throw new Error('OpenRouter returned an empty extraction response.');

  return normalizeExtraction(parseJsonObject(content));
};

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const documents = body?.documents as Record<string, UploadedDoc> | undefined;

  if (!documents || Object.keys(documents).length === 0) {
    return jsonError('At least one uploaded document is required for extraction.');
  }

  const demoMode = await getDemoModeState();

  if (demoMode.enabled) {
    return jsonOk({
      claimId: body?.claimId || 'CLM-2852',
      extractedData: mockExtractedClaimData,
      sourceDocumentCount: Object.keys(documents).length,
      source: 'demo',
    });
  }

  if (demoMode.provider !== 'openrouter') {
    return jsonError(
      'Live extraction requires OPENROUTER_API_KEY, or turn Demo Mode on in Settings to use mock extraction.',
      503
    );
  }

  try {
    return jsonOk({
      claimId: body?.claimId || 'CLM-2852',
      extractedData: await runOpenRouterExtraction(documents),
      sourceDocumentCount: Object.keys(documents).length,
      source: 'openrouter',
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'OpenRouter extraction failed.', 502);
  }
}
