-- Create claims table
CREATE TABLE IF NOT EXISTS public.claims (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    upload_session_id TEXT,
    file_name TEXT,
    file_size INTEGER,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    extracted_data JSONB,
    validation_errors JSONB DEFAULT '[]'::jsonb,
    repair_suggestions JSONB DEFAULT '[]'::jsonb,
    health_score INTEGER DEFAULT 0,
    readiness_score INTEGER DEFAULT 0,
    ocr_confidence INTEGER DEFAULT 0,
    classified_pages JSONB DEFAULT '[]'::jsonb,
    patient_name TEXT,
    hospital_name TEXT,
    rejection_risk TEXT,
    validation_count INTEGER DEFAULT 0,
    repair_suggestion_count INTEGER DEFAULT 0,
    assigned_reviewer TEXT DEFAULT 'Desk Agent'
);

-- Create claim_audit_logs table
CREATE TABLE IF NOT EXISTS public.claim_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id TEXT NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create claim_validation_items table
CREATE TABLE IF NOT EXISTS public.claim_validation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id TEXT NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    issue TEXT NOT NULL,
    severity TEXT NOT NULL,
    field TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IMPORTANT: Grant privileges to allow Next.js client to access the tables
GRANT ALL ON TABLE public.claims TO anon, authenticated;
GRANT ALL ON TABLE public.claim_audit_logs TO anon, authenticated;
GRANT ALL ON TABLE public.claim_validation_items TO anon, authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
