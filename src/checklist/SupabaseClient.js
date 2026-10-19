// The checklist module shares VPR's single Supabase client (same project,
// same anon key) instead of opening a second connection. Its pages import
// this file as a default export, so re-export it under that shape.
import { supabase } from '../supabase';

export default supabase;
