import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://hcoazumnowqhnbhzucck.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhjb2F6dW1ub3dxaG5iaHp1Y2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0OTk5MDksImV4cCI6MjA5ODA3NTkwOX0.9G7CSyG-Vdx7iszzjBt5eoybv7FuQaLsFACBDGiMXbU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});