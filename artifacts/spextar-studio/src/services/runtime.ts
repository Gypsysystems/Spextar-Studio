import type { Services } from './contracts';
import { createDemoServices } from './demo-adapter';
import { createSupabaseServices } from './supabase-adapter';
import { createStudioSupabaseClient } from './supabase-client';

/** Explicit mode choice. Unknown values fail closed; backend never falls back to demo. */
export function createRuntimeServices(mode: string = import.meta.env.VITE_STUDIO_MODE ?? 'demo'): Services {
  if (mode === 'demo') return createDemoServices();
  if (mode === 'backend') return createSupabaseServices(createStudioSupabaseClient());
  throw new Error(`Unsupported Studio mode: ${mode}`);
}
