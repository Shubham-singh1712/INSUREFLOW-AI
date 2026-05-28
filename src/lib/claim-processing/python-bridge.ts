import { exec, spawn } from 'child_process'; // // MODIFIED
import { promisify } from 'util'; // // MODIFIED
import path from 'path'; // // MODIFIED
import { logger } from './logger'; // // MODIFIED
import type { PageText } from './types';

const execAsync = promisify(exec); // // MODIFIED

export interface PythonExtractionResult { // // MODIFIED
  patient_name: string; // // MODIFIED
  customer_id: string; // // MODIFIED
  date_of_birth: string; // // MODIFIED
  policy_number: string; // // MODIFIED
  diagnosis_code: string; // // MODIFIED
  procedure_code: string; // // MODIFIED
  treating_doctor: string; // // MODIFIED
  hospital_name: string; // // MODIFIED
  admission_date: string; // // MODIFIED
  discharge_date: string; // // MODIFIED
  claim_amount: string; // // MODIFIED
  confidence: Record<string, number>; // // MODIFIED
  needs_review: string[]; // // MODIFIED
} // // MODIFIED

async function getPythonCommand(): Promise<string> { // // MODIFIED
  const commands = ['python', 'python3', 'py']; // // MODIFIED
  for (const cmd of commands) { // // MODIFIED
    try { // // MODIFIED
      const { stdout } = await execAsync(`${cmd} --version`); // // MODIFIED
      if (stdout) { // // MODIFIED
        return cmd; // // MODIFIED
      } // // MODIFIED
    } catch { // // MODIFIED
      continue; // // MODIFIED
    } // // MODIFIED
  } // // MODIFIED
  throw new Error('Python is not installed or not found in system PATH'); // // MODIFIED
} // // MODIFIED

export async function runPythonExtraction( // // MODIFIED
  imagePath: string, // // MODIFIED
  api_key?: string // // MODIFIED
): Promise<PythonExtractionResult> { // // MODIFIED
  const pythonCmd = await getPythonCommand(); // // MODIFIED
  const scriptPath = path.join(process.cwd(), 'pipeline.py'); // // MODIFIED

  return new Promise((resolve, reject) => { // // MODIFIED
    const args = [scriptPath, imagePath]; // // MODIFIED
    if (api_key) { // // MODIFIED
      args.push('--api-key', api_key); // // MODIFIED
    } // // MODIFIED

    logger.info('PYTHON_BRIDGE', `Executing: ${pythonCmd} ${args.join(' ')}`); // // MODIFIED

    const env = { // // MODIFIED
      ...process.env, // // MODIFIED
      ANTHROPIC_API_KEY: api_key || process.env.ANTHROPIC_API_KEY || '', // // MODIFIED
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '', // // MODIFIED
    }; // // MODIFIED

    const pyProcess = spawn(pythonCmd, args, { env, cwd: process.cwd() }); // // MODIFIED

    let stdoutData = ''; // // MODIFIED
    let stderrData = ''; // // MODIFIED

    pyProcess.stdout.on('data', (data) => { // // MODIFIED
      stdoutData += data.toString(); // // MODIFIED
    }); // // MODIFIED

    pyProcess.stderr.on('data', (data) => { // // MODIFIED
      stderrData += data.toString(); // // MODIFIED
    }); // // MODIFIED

    pyProcess.on('close', (code) => { // // MODIFIED
      if (code !== 0) { // // MODIFIED
        logger.error('PYTHON_BRIDGE', `Python process exited with code ${code}. Stderr: ${stderrData}`); // // MODIFIED
        reject(new Error(`Python pipeline failed with code ${code}: ${stderrData}`)); // // MODIFIED
        return; // // MODIFIED
      } // // MODIFIED

      try { // // MODIFIED
        const jsonStart = stdoutData.indexOf('{'); // // MODIFIED
        const jsonEnd = stdoutData.lastIndexOf('}'); // // MODIFIED
        if (jsonStart === -1 || jsonEnd === -1) { // // MODIFIED
          throw new Error('No valid JSON output found in stdout'); // // MODIFIED
        } // // MODIFIED
        const jsonStr = stdoutData.substring(jsonStart, jsonEnd + 1); // // MODIFIED
        const parsed = JSON.parse(jsonStr) as PythonExtractionResult; // // MODIFIED
        resolve(parsed); // // MODIFIED
      } catch (err: any) { // // MODIFIED
        logger.error('PYTHON_BRIDGE', `Failed to parse Python JSON output. Raw stdout: ${stdoutData}`); // // MODIFIED
        reject(new Error(`Failed to parse Python output: ${err.message}`)); // // MODIFIED
      } // // MODIFIED
    }); // // MODIFIED
  }); // // MODIFIED
} // // MODIFIED

// ─────────────────────────────────────────────────────────────────────────────
// Python OCR bridge — calls ocr_pdf.py which uses PyMuPDF + Tesseract
// This is the RELIABLE path for scanned PDFs (bypasses broken pdfjs+napi-rs)
// ─────────────────────────────────────────────────────────────────────────────

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
  error?: string;  // set when Python script reports an error
}

/**
 * Run Python OCR on a saved PDF file.
 * Returns per-page text + confidence, ready for the extraction pipeline.
 * Throws if Python or ocr_pdf.py cannot be executed.
 */
export async function runPythonOcr(
  pdfPath: string,
  scale = 2.0
): Promise<PageText[]> {
  const pythonCmd = await getPythonCommand();
  const scriptPath = path.join(process.cwd(), 'ocr_pdf.py');

  logger.info('PYTHON_OCR', `Running OCR via Python on: ${pdfPath}`);

  return new Promise((resolve, reject) => {
    const args = [scriptPath, pdfPath, '--scale', String(scale)];
    const pyProcess = spawn(pythonCmd, args, { cwd: process.cwd(), env: process.env });

    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (d) => { stdout += d.toString(); });
    pyProcess.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) logger.info('PYTHON_OCR', line);
      stderr += line;
    });

    pyProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error('PYTHON_OCR', `Python OCR exited ${code}. stderr: ${stderr}`);
        return reject(new Error(`Python OCR failed (exit ${code}): ${stderr.slice(0, 400)}`));
      }

      try {
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('No JSON in Python OCR output');
        }
        const parsed: PythonOcrResult = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));

        if (parsed.error) {
          throw new Error(parsed.error);
        }

        logger.info(
          'PYTHON_OCR',
          `OCR complete: ${parsed.total_chars} chars across ${parsed.page_count} pages (backend: ${parsed.backend})`
        );

        const pages: PageText[] = parsed.pages.map((p) => ({
          page: p.page,
          text: p.text,
          method: 'ocr' as const,
          confidence: p.confidence,
        }));

        resolve(pages);
      } catch (err: any) {
        logger.error('PYTHON_OCR', `Failed to parse Python OCR output: ${err.message}\nRaw: ${stdout.slice(0, 500)}`);
        reject(new Error(`Failed to parse Python OCR output: ${err.message}`));
      }
    });

    pyProcess.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}
