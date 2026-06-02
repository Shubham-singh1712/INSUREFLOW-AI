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

async function listTables() {
  console.log('Querying Supabase API schema for tables...');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    if (!res.ok) {
      console.error('API Error:', res.status, res.statusText);
      const text = await res.text();
      console.error(text);
      return;
    }
    const schema = await res.json();
    console.log('Tables available in public schema:');
    if (schema.paths) {
      Object.keys(schema.paths).forEach((p) => {
        if (p.startsWith('/') && p !== '/') {
          console.log(' -', p);
        }
      });
    } else {
      console.log('No tables found or empty schema definitions.');
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

listTables();
