import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://jbejnrgeqyrdvhhrzeoe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZWpucmdlcXlyZHZoaHJ6ZW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDExODAsImV4cCI6MjEwMTk3NzE4MH0.GEUMSUv8EsfkgM8fyh1ycFqyCzvqQ2sDR3EV3EgZ0YI';

// Safe storage engine adapter for Web / SSR / Mobile
const CustomStorage = {
  getItem: async (key) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return null; // Prevents SSR window crash
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return;
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return;
    }
    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: CustomStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
