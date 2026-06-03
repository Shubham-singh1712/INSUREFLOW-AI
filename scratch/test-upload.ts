import { readFile } from 'fs/promises';
import { listLiveClaims } from '../src/lib/liveClaims';
import { createClient } from '../src/lib/supabase/server';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Manually parse .env file
const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/(^"|"$)/g, '');
    process.env[key] = value;
  }
});

async function run() {
  console.log("Fetching live claims from Supabase BEFORE upload...");
  // Use a hardcoded dummy user ID for testing
  const userId = '11111111-1111-1111-1111-111111111111';
  let initialClaims = await listLiveClaims(userId);
  console.log(`Claims in Supabase: ${initialClaims.length}`);

  console.log("\nSimulating PDF Upload...");
  // Simulate process API route behavior:
  const claimId = `CLAIM-${Date.now()}`;
  const uploadSessionId = `SESSION-${Date.now()}`;
  const fileName = 'Apollo_Glaucoma_HighRisk_Claim.pdf';
  
  // 1. Create Claim in Supabase
  const { createClaim } = await import('../src/lib/claim-processing/db');
  await createClaim(userId, claimId, uploadSessionId, fileName, 1024 * 1024);
  console.log(`Created claim in DB: ${claimId}`);

  // 2. Run Pipeline (Demo Mode enabled by default in settings)
  const { processDemoClaimPipeline } = await import('../src/lib/claim-processing/demo-pipeline');
  const buffer = Buffer.from("dummy pdf content");
  console.log(`Running pipeline...`);
  const packet = await processDemoClaimPipeline(buffer, claimId, fileName, uploadSessionId);
  console.log(`Pipeline completed. Final state: ${packet.state}`);

  console.log("\nFetching live claims from Supabase AFTER upload...");
  const finalClaims = await listLiveClaims(userId);
  console.log(`Claims in Supabase: ${finalClaims.length}`);

  const uploadedClaim = finalClaims.find(c => c.claimId === claimId);
  if (uploadedClaim) {
    console.log("\nEVIDENCE FROM SUPABASE:");
    console.log(`Claim ID: ${uploadedClaim.claimId}`);
    console.log(`Patient Name: ${uploadedClaim.patient}`);
    console.log(`Status: ${uploadedClaim.status}`);
    console.log(`Source: Supabase`);
  } else {
    console.log("Claim not found in Supabase! Something is wrong.");
  }
}

run().catch(console.error);
