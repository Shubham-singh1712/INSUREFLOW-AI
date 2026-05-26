import { exec, spawn } from 'child_process'; // // MODIFIED
import { promisify } from 'util'; // // MODIFIED
import path from 'path'; // // MODIFIED
import { logger } from './logger'; // // MODIFIED

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
