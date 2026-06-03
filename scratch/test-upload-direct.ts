import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    envVars[key] = parts.slice(1).join('=').trim().replace(/(^"|"$)/g, '');
  }
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const userId = '11111111-1111-1111-1111-111111111111';
  const claimId = `CLAIM-${Date.now()}`;
  
  console.log(`Inserting claim: ${claimId}`);
  const { data: insertData, error: insertError } = await supabase.from('claims').insert({
    id: claimId,
    user_id: userId,
    upload_session_id: 'TEST_SESSION',
    file_name: 'test.pdf',
    file_size: 1000,
    status: 'PROCESSING',
    patient_name: 'Test Patient',
    readiness_score: 85,
    extracted_data: { test: "data" }
  }).select('*');

  if (insertError) {
    console.error("Insert Error:", insertError);
    return;
  }

  console.log("Insert Success:", insertData);
}

run();
