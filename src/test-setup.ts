import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Stub des variables d'env Supabase pour les tests qui importent
// transitivement `@/lib/supabase` (ex : EcrituresModal via la barrel
// `@/components/ui`). Sans cela, createClient() lève « supabaseUrl is
// required » au chargement du module et fait échouer toute la suite.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

afterEach(() => {
  cleanup()
})
