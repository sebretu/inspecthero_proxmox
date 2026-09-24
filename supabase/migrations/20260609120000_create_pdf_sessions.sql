-- Tworzenie bucketu dla plików PDF edytora
INSERT INTO storage.buckets (id, name, public) VALUES ('pdf_sessions_files', 'pdf_sessions_files', true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.pdf_sessions (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    pdf_url text NOT NULL,
    symbols jsonb DEFAULT '[]'::jsonb NOT NULL,
    texts jsonb DEFAULT '[]'::jsonb NOT NULL,
    cutouts jsonb DEFAULT '[]'::jsonb NOT NULL,
    zoom double precision DEFAULT 1.0 NOT NULL,
    page_number integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.pdf_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pdf sessions" ON public.pdf_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pdf sessions" ON public.pdf_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pdf sessions" ON public.pdf_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pdf sessions" ON public.pdf_sessions
    FOR DELETE USING (auth.uid() = user_id);
