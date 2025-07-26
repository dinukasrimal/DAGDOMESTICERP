-- Fix invoice sync issues by adding proper constraints and indexes
-- This migration addresses sync failures caused by lack of proper constraints

-- First, check if there are any duplicate names and handle them
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    -- Count existing duplicates
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT name, COUNT(*) as cnt
        FROM public.invoices 
        WHERE name IS NOT NULL
        GROUP BY name
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % duplicate invoice names. Adding suffix to resolve conflicts.', duplicate_count;
        
        -- Add suffix to duplicate names to make them unique
        UPDATE public.invoices 
        SET name = name || '_' || id
        WHERE id IN (
            SELECT id FROM (
                SELECT id, name, 
                       ROW_NUMBER() OVER (PARTITION BY name ORDER BY date_order DESC) as rn
                FROM public.invoices 
                WHERE name IS NOT NULL
            ) ranked
            WHERE rn > 1
        );
    END IF;
END $$;

-- Add unique constraint on name field to prevent future duplicates
ALTER TABLE public.invoices ADD CONSTRAINT invoices_name_unique UNIQUE (name);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_name ON public.invoices (name);
CREATE INDEX IF NOT EXISTS idx_invoices_date_order ON public.invoices (date_order DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_partner_name ON public.invoices (partner_name);
CREATE INDEX IF NOT EXISTS idx_invoices_state ON public.invoices (state);

-- Add a composite index for common queries
CREATE INDEX IF NOT EXISTS idx_invoices_date_partner ON public.invoices (date_order DESC, partner_name);

-- Add a sync status table to track sync operations
CREATE TABLE IF NOT EXISTS public.sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type VARCHAR(50) NOT NULL,
    last_sync_timestamp TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
    total_records INTEGER DEFAULT 0,
    synced_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes on sync_status table
CREATE INDEX IF NOT EXISTS idx_sync_status_type_timestamp ON public.sync_status (sync_type, last_sync_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sync_status_status ON public.sync_status (status);

-- Insert initial sync status record for invoices
INSERT INTO public.sync_status (sync_type, status, created_at)
VALUES ('invoices', 'completed', NOW())
ON CONFLICT DO NOTHING;

-- Add RLS policies for sync_status table (if RLS is enabled)
-- ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;

-- Create a function to update sync status
CREATE OR REPLACE FUNCTION public.update_sync_status(
    p_sync_type VARCHAR(50),
    p_status VARCHAR(20),
    p_total_records INTEGER DEFAULT NULL,
    p_synced_records INTEGER DEFAULT NULL,
    p_failed_records INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    sync_id UUID;
BEGIN
    INSERT INTO public.sync_status (
        sync_type, 
        status, 
        total_records, 
        synced_records, 
        failed_records, 
        error_message,
        updated_at
    )
    VALUES (
        p_sync_type,
        p_status,
        p_total_records,
        p_synced_records,
        p_failed_records,
        p_error_message,
        NOW()
    )
    RETURNING id INTO sync_id;
    
    RETURN sync_id;
END;
$$;

-- Add a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to sync_status table
DROP TRIGGER IF EXISTS update_sync_status_updated_at ON public.sync_status;
CREATE TRIGGER update_sync_status_updated_at
    BEFORE UPDATE ON public.sync_status
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.sync_status IS 'Tracks synchronization operations for all data types';
COMMENT ON COLUMN public.sync_status.sync_type IS 'Type of sync operation (invoices, purchases, sales, etc.)';
COMMENT ON COLUMN public.sync_status.status IS 'Current status: pending, running, completed, failed';
COMMENT ON CONSTRAINT invoices_name_unique ON public.invoices IS 'Ensures invoice names are unique to prevent sync conflicts';