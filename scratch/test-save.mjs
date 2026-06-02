import fs from 'fs';
import path from 'path';

const storePath = path.join(process.cwd(), '.data', 'live-claims.json');

try {
  const content = fs.readFileSync(storePath, 'utf8');
  const claims = JSON.parse(content);
  console.log('Original claims count:', claims.length);

  const testClaim = {
    id: 'test-write-id',
    claimId: 'test-write-id',
    patient: 'Test Writer',
    userId: '0d00e1b4-8c4e-4adf-a03f-5777fe6009b1',
    status: 'UNDER_REVIEW'
  };

  const updated = [testClaim, ...claims.filter(c => c.claimId !== 'test-write-id')];
  fs.writeFileSync(storePath, JSON.stringify(updated, null, 2), 'utf8');
  console.log('Successfully wrote to cache file!');

  // Verify
  const verifiedContent = fs.readFileSync(storePath, 'utf8');
  const verifiedClaims = JSON.parse(verifiedContent);
  console.log('New claims count after write:', verifiedClaims.length);

  // Clean up
  const cleaned = verifiedClaims.filter(c => c.claimId !== 'test-write-id');
  fs.writeFileSync(storePath, JSON.stringify(cleaned, null, 2), 'utf8');
  console.log('Cleaned up test claim.');

} catch (err) {
  console.error('Error in write test:', err);
}
