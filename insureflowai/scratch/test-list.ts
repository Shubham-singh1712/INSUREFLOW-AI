import { listLiveClaims } from '../src/lib/liveClaims';

async function test() {
  try {
    console.log('Calling listLiveClaims...');
    const claims = await listLiveClaims(null);
    console.log(`Success! Loaded ${claims.length} claims.`);
    if (claims.length > 0) {
      console.log('Sample claim:', JSON.stringify(claims[0], null, 2));
    }
  } catch (err: any) {
    console.error('Error in test:', err);
  }
}

test();
