import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse .env manually
try {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([^#\s=]+)\s*=\s*(.+?)\s*$/);
      if (match) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
      }
    }
  }
} catch (err: any) {
  console.warn('Failed to load .env file:', err.message);
}

import { processClaimPipeline } from '../src/lib/claim-processing/pipeline';

async function test() {
  const pdfPath =
    'c:/Users/SHUBHAM/OneDrive/Documents/INFLOW/sample-pdfs/PREAUTH OF OF PT  PAVAN YADAV.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.error('Sample PDF not found at:', pdfPath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(pdfPath);

  const session = {
    claimId: 'test-claim-id-' + Date.now(),
    uploadSessionId: 'test-session-id',
    originalFileName: 'PREAUTH OF OF PT  PAVAN YADAV.pdf',
    fileSizeBytes: buffer.length,
    uploadStartedAt: new Date().toISOString(),
  };

  console.log('Starting E2E pipeline test with Direct Gemini LLM fallback on:', pdfPath);
  try {
    const packet = await processClaimPipeline(buffer, session);
    console.log('\n======================================');
    console.log('Pipeline execution COMPLETED!');
    console.log('======================================');
    console.log('Success:', packet.success);
    console.log('Extraction Method:', packet.extractionMethod);
    console.log('Page Count:', packet.pageCount);
    console.log('OCR Confidence:', packet.ocrConfidence);
    console.log('Claim Health:', packet.claimHealth);
    console.log('Readiness:', packet.readiness);
    console.log('State:', packet.state);
    console.log('\nExtracted Fields preview:');
    console.log(JSON.stringify(packet.extractedFields, null, 2));
    console.log('\nValidation Errors:', packet.validationErrors);
  } catch (err: any) {
    console.error('Pipeline execution FAILED:', err.stack || err.message || err);
  }
}

test();
