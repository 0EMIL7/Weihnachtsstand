import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const EXTRA_OPTIONEN = [
  'Mit Scharf',
  'Ohne Scharf',
  'Mit Cocktailsauce',
  'Mit Knoblauchsauce',
  'Ohne Zwiebeln',
  'Ohne Rotkraut',
  'Alles komplett'
];

export const formatBestellNummer = (id) => {
  if (!id) return '#000';
  return '#' + String(id).padStart(3, '0');
};
