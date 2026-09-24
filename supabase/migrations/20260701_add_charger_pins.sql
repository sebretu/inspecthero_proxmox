-- Migration: Add service_pin and activation_pin to chargers table
ALTER TABLE public.chargers ADD COLUMN IF NOT EXISTS service_pin text;
ALTER TABLE public.chargers ADD COLUMN IF NOT EXISTS activation_pin text;
