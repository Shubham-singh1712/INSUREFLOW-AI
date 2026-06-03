import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Need service role key to delete across all users or delete without RLS
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

async function clearClaims() {
  console.log('Clearing fake demo claims from Supabase...');
  
  const fakeNames = ['Meera Krishnan', 'Aditya Sharma', 'Amitabh Verma', 'Priya Nair', 'Arjun Mehta', 'Ramesh', 'Ramesh Iyer'];
  
  // We can just query and delete them
  for (const name of fakeNames) {
    const { error } = await supabase
      .from('claims')
      .delete()
      .ilike('patient_name', `%${name}%`);
      
    if (error) {
      console.error(`Failed to delete claims for ${name}:`, error.message);
    } else {
      console.log(`Deleted fake claims for ${name}`);
    }
  }
  
  // Just to be absolutely sure, let's also delete claims that don't have a valid patient name
  // Or we could delete ALL claims if the user wants a completely fresh start.
  // We will delete all claims that are in the demo data JSONs
  const { data: allClaims } = await supabase.from('claims').select('id, patient_name');
  if (allClaims) {
    const fakeList = ['Sanjay Dutt', 'Sunita Mehra', 'Rajesh Kumar', 'Kavya Nair', 'Priyanka Sen', 'Priyanka', 'Devendra Gowda', 'Harish Chandra', 'Rohan Mehra', 'Vijay Mallya', 'Anitha Nair', 'Kishore Kumar', 'Gurpreet Singh', 'Vikram Seth', 'Ramesh Tendulkar', 'Subbarami Reddy', 'Rahul Deshmukh', 'Subhas Bose'];
    for (const claim of allClaims) {
      if (fakeList.some(fake => claim.patient_name && claim.patient_name.includes(fake))) {
        await supabase.from('claims').delete().eq('id', claim.id);
        console.log(`Deleted fake claim ${claim.id} (${claim.patient_name})`);
      }
    }
  }

  console.log('Done clearing Supabase fake claims.');
}

clearClaims();
