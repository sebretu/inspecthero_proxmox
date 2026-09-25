--
-- PostgreSQL database dump
--

\restrict Sh4SwbxI3vIQZh3vZvi7uDLXWcStnZFx82fkfZJmrfghWVgIho6ApL3CXNog5A8

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'dev@example.com', '$2a$06$tcRIq.mUZW35KimA.7m9s.Ah2azcJ4q5z/fcQ2DFxuWeB2i3s5Ysq', '2026-02-09 16:29:02.341523+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{}', NULL, '2026-02-09 16:29:02.341523+00', '2026-02-09 16:29:02.341523+00', NULL, NULL, '', '', NULL, DEFAULT, '', 0, NULL, '', NULL, false, NULL, false);


--
-- PostgreSQL database dump complete
--

\unrestrict Sh4SwbxI3vIQZh3vZvi7uDLXWcStnZFx82fkfZJmrfghWVgIho6ApL3CXNog5A8

