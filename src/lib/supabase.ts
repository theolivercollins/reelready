import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vrhmaeywqsohlztoouxu.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaG1hZXl3cXNvaGx6dG9vdXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDIxOTIsImV4cCI6MjA5MTQxODE5Mn0.GaiexH5L24zAoLgvjOUiixbHdnQW8kUMXXbyjnM8cM4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
