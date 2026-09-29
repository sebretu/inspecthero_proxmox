ALTER TABLE "public"."aufmass_sessions" DROP CONSTRAINT IF EXISTS "aufmass_sessions_session_type_check";
ALTER TABLE "public"."aufmass_sessions" ADD CONSTRAINT "aufmass_sessions_session_type_check" CHECK ((session_type IN ('aufmass'::text, 'zusatz'::text, 'baubehinderung'::text, 'bestellung'::text, 'fragen'::text)));
NOTIFY pgrst, 'reload schema';
