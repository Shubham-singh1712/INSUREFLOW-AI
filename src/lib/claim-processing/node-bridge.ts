import { spawn } from 'child_process';
import path from 'path';
import { logger } from './logger';
import type { PythonExtractionResult } from './python-bridge';

export interface PythonOcrPage {
  page: number;
  text: string;
  confidence: number;
}

export interface PythonOcrResult {
  pages: PythonOcrPage[];
  page_count: number;
  total_chars: number;
  backend: string;
  error?: string;
}

/**
 * Spawns a separate Node.js process to run ocr_worker.mjs.
 * This completely isolates CPU-heavy and memory-intensive canvas/OCR operations.
 */
export async function runOcrWorkerSubprocess(
  pdfPath: string,
  tempDir: string,
  runOcr: boolean
): Promise<PythonOcrResult> {
  const scriptPath = path.join(process.cwd(), 'ocr_worker.mjs');
  const runOcrStr = runOcr ? 'true' : 'false';

  logger.info(
    'NODE_OCR_BRIDGE',
    `Spawning ocr_worker subprocess: node ocr_worker.mjs "${pdfPath}" "${tempDir}" "${runOcrStr}"`
  );

  return new Promise((resolve, reject) => {
    const args = [scriptPath, pdfPath, tempDir, runOcrStr];
    // Use process.execPath to launch the exact same node executable
    const nodeProcess = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env });

    let stdout = '';
    let stderr = '';

    nodeProcess.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    nodeProcess.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) {
        logger.info('NODE_OCR_BRIDGE_ERR', line);
      }
      stderr += line;
    });

    nodeProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(
          'NODE_OCR_BRIDGE',
          `OCR worker subprocess exited with code ${code}. Stderr: ${stderr}`
        );
        return reject(new Error(`OCR worker failed (exit ${code}): ${stderr.slice(0, 400)}`));
      }

      try {
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('No JSON output from OCR worker subprocess');
        }
        const parsed: PythonOcrResult = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        resolve(parsed);
      } catch (err: any) {
        logger.error(
          'NODE_OCR_BRIDGE',
          `Failed to parse OCR worker output: ${err.message}. Raw: ${stdout}`
        );
        reject(new Error(`Failed to parse OCR worker output: ${err.message}`));
      }
    });

    nodeProcess.on('error', (err) => {
      logger.error('NODE_OCR_BRIDGE', `Failed to spawn node process: ${err.message}`);
      reject(new Error(`Failed to spawn node process: ${err.message}`));
    });
  });
}

/**
 * Direct Gemini LLM extraction over raw OCR text.
 * Runs when the Python OpenCV pipeline fails or is not supported.
 */
export async function runLlmExtraction(
  rawText: string
): Promise<PythonExtractionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured in .env');
  }

  logger.info('NODE_LLM_BRIDGE', 'Requesting structured claim extraction from OpenRouter/Gemini...');

  const prompt = `
You are an expert medical claims processor. 
Analyze the following raw text extracted from a health insurance pre-authorization form.
Extract the required information carefully. If a field is not present, leave it empty ("").

RAW DOCUMENT TEXT:
${rawText}

Return a valid JSON object matching this schema:
{
  "patient_name": "Full name of the patient (Title Case)",
  "patient_age": "Age of the patient in years as a number, or null if not found",
  "gender": "Gender of the patient (Male, Female, etc.), or null if not found",
  "tpa_name": "Name of the TPA or Insurance Company",
  "tpa_id_number": "The TPA ID or Member ID number",
  "hospital_name": "Full hospital name",
  "treating_doctor": "Name of treating physician",
  "provisional_diagnosis": "The provisional diagnosis or nature of illness",
  "total_expected_cost": "Total sum expected cost of hospitalization. Extract only the number as a float or integer, or null if not found",
  "total_expected_cost_evidence": "The exact text block snippet from the document from which total_expected_cost was extracted (e.g. 'Sum Total expected cost of hospitalization 1,07,467/-')",
  "has_aadhaar": "True if an Aadhaar card (12-digit number, UIDAI, or Aadhaar logo/mention) is found in the document, otherwise False",
  "has_pan": "True if a PAN card (Income Tax Department or PAN number pattern like [A-Z]{5}[0-9]{4}[A-Z]) is found in the document, otherwise False",
  "customer_id": "Alphanumeric policy-holder ID / customer ID",
  "date_of_birth": "Date of birth (DD/MM/YYYY or YYYY-MM-DD)",
  "policy_number": "Policy number",
  "diagnosis_code": "ICD-10 code (e.g. J18.0)",
  "procedure_code": "NABH / CPT procedure code",
  "admission_date": "Date of admission (DD/MM/YYYY or YYYY-MM-DD)",
  "discharge_date": "Date of discharge (DD/MM/YYYY or YYYY-MM-DD)",
  "claim_amount": "Numeric amount in INR (digits only, no commas)",
  "confidence": {
    "patient_name": 90,
    "patient_age": 90,
    "gender": 90,
    "tpa_name": 90,
    "tpa_id_number": 90,
    "hospital_name": 90,
    "treating_doctor": 90,
    "provisional_diagnosis": 90,
    "total_expected_cost": 90,
    "total_expected_cost_evidence": 90,
    "has_aadhaar": 90,
    "has_pan": 90,
    "customer_id": 90,
    "date_of_birth": 90,
    "policy_number": 90,
    "diagnosis_code": 90,
    "procedure_code": 90,
    "admission_date": 90,
    "discharge_date": 90,
    "claim_amount": 90
  },
  "needs_review": []
}

Ensure the response contains ONLY the valid JSON object, without any markdown formatting or code blocks.
`;

  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4028',
      'X-Title': 'InsureFlow AI',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You extract healthcare insurance claim data. Return only valid JSON matching the requested schema.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenRouter');
  }

  try {
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No JSON object found in response content');
    }
    const cleanJson = content.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(cleanJson) as PythonExtractionResult;
    return parsed;
  } catch (err: any) {
    throw new Error(`Failed to parse LLM JSON extraction: ${err.message}. Raw content: ${content}`);
  }
}
