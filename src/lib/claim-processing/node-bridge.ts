import { spawn } from 'child_process';
import path from 'path';
import { logger } from './logger';

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
    // Use spawn to execute the process cleanly
    const nodeProcess = spawn('node', args, { cwd: process.cwd(), env: process.env });

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
