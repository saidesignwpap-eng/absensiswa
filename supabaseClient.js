import { createClient } from '@supabase/supabase-js';

// Ganti string di bawah ini dengan kunci asli Anda
const supabaseUrl = 'https://jthpozhixqblnkhcfrgm.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0aHBvemhpeHFibG5raGNmcmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTYxNTQsImV4cCI6MjA4NDk5MjE1NH0.oJbawVfSPhPkF6-r82zHRO-nAp5BRUCG-gHObSwcJhw';

export const supabase = createClient(supabaseUrl, supabaseKey);
