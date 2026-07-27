import { createClient } from '@supabase/supabase-js';

// Read-only Supabase client for the browser. Uses the publishable key from .env
// (VITE_-prefixed vars are exposed to client code by Vite). Data access is
// governed by Row Level Security on the Supabase side — this client only ever
// issues SELECTs from the UI.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
