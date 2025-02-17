// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vctuoupvfzofjtteiolo.supabase.co'; // Replace with your Supabase URL
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHVvdXB2ZnpvZmp0dGVpb2xvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk4MTYzMDksImV4cCI6MjA1NTM5MjMwOX0.DWOKeydDo0lQbUSTLrH3duarm5I2UZOXziBQF7E1JTc';                     // Replace with your anon key

export const supabase = createClient(supabaseUrl, supabaseAnonKey);