import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Connecting to:', url);
const supabase = createClient(url, key);

const { data, error } = await supabase.from('claims').select('*');
if (error) {
  console.error('Error fetching claims:', error);
} else {
  console.log('Claims count in Supabase:', data.length);
  for (const c of data) {
    console.log(`- ID: ${c.id}, Status: ${c.status}, Patient: ${c.patient_name}, User ID: ${c.user_id}, Created: ${c.created_at}`);
  }
}
