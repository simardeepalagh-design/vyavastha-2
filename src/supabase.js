import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jzftcwnnujhvylcwnntn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZnRjd25udWpodnlsY3dubnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDU5MDIsImV4cCI6MjA5NTAyMTkwMn0.9x-O7W_mCfn460Y0hvfOIV75He-UZknqNf_p0jJ94X4';

export const supabase = createClient(supabaseUrl, supabaseKey);