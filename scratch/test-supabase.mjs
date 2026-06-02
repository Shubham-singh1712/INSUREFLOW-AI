import { createClient } from '@supabase/supabase-js';

const url = 'https://woikxyyoubtsdeumsvzu.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaWt4eXlvdWJ0c2RldW1zdnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTAwNTksImV4cCI6MjA5Mzg4NjA1OX0.sYJ6bkxHJ0dzlqIGdzVnhMChv86rztbR2DIcXY2piO4';

const supabase = createClient(url, key);

async function test() {
  console.log('Querying Supabase...');
  try {
    const { data, error } = await supabase.from('claims').select('*');
    if (error) {
      console.error('Supabase query failed:', error);
    } else {
      console.log('Supabase query succeeded! Number of claims in DB:', data.length);
      if (data.length > 0) {
        console.log('Sample claim from DB:', data[0]);
      }
    }
  } catch (err) {
    console.error('Crash querying Supabase:', err);
  }
}

test();
