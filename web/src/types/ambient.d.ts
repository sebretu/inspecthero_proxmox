declare module 'leaflet';
declare module 'formidable';

// allow treating unknown rpc names in supabase.types during a migration
declare module '@repo/supabase' {
  // keep original types, this file only augments ambient modules when missing
}
