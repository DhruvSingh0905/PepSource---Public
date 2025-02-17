// supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY; // You can create this in Supabase, instead of using the service key

export const supabase = createClient(supabaseUrl, supabaseAnonKey);