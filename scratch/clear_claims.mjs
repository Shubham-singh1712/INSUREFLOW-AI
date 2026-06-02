import fs from 'fs';
import path from 'path';

// 1. Clear local cache
const storePath = path.join(process.cwd(), '.data', 'live-claims.json');
try {
  fs.writeFileSync(storePath, '[]');
  console.log('Cleared local cache');
} catch (err) {
  console.log('No local cache to clear or error:', err.message);
}
