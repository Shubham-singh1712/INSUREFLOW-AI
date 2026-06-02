import { createClient } from '../src/lib/supabase/server';

async function test() {
  try {
    console.log('Testing createClient...');
    const supabase = await createClient();
    console.log('supabase client created successfully. Fetching user...');
    const { data: { user }, error } = await supabase.auth.getUser();
    console.log('getUser completed. User:', user, 'Error:', error);
  } catch (err: any) {
    console.error('Error in test:', err.message, err.stack);
  }
}

test();
