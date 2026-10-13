// lib/supabase.ts — WRAPPER TEMPORÁRIO (compatibilidade)
// TODO: migrar imports das páginas para '@/lib/supabase/client' e deletar este arquivo
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);