import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually parse .env file
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach((line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/(^"|"$)/g, '');
    envVars[key] = value;
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function getLatestClaim() {
  const { data, error } = await supabase
    .from('claims')
    .select('id, status, patient_name, created_at, extracted_data')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching claim:', error);
    return;
  }

  if (data && data.length > 0) {
    const claim = data[0];
    console.log(`CLAIM_ID: ${claim.id}`);
    console.log(`STATUS: ${claim.status}`);
    console.log(`PATIENT_NAME: ${claim.patient_name}`);
    console.log(`CREATED_AT: ${claim.created_at}`);
    
    let extractedDataStr = '';
    if (typeof claim.extracted_data === 'string') {
      extractedDataStr = claim.extracted_data;
    } else {
      extractedDataStr = JSON.stringify(claim.extracted_data, null, 2);
    }
    
    if (extractedDataStr) {
      console.log(`EXTRACTED_DATA (First 500 chars):\n${extractedDataStr.substring(0, 500)}`);
    } else {
      console.log(`EXTRACTED_DATA: (null or empty)`);
    }
  } else {
    console.log('No claims found in the database.');
  }
}

getLatestClaim();
