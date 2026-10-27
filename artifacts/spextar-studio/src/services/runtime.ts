import { ServiceError, type Services } from './contracts';
import type { StudioMode } from '@/domain/types';
import { createDemoServices } from './demo-adapter';
import { createSupabaseServices } from './supabase-adapter';
import { createStudioSupabaseClient } from './supabase-client';

/** Explicit mode choice. Unknown values fail closed; backend never falls back to demo. */
export function resolveStudioMode(value: unknown, production: boolean): StudioMode {
  if (value === undefined && !production) return 'demo';
  if (value === undefined) throw new ServiceError('Studio mode is not configured. Set VITE_STUDIO_MODE to backend or demo and rebuild.', 'unavailable');
  if (value !== 'demo' && value !== 'backend') throw new Error(`Unsupported Studio mode: ${String(value)}`);
  return value;
}
export function createRuntimeServices(mode: string | undefined = import.meta.env.VITE_STUDIO_MODE): Services {
  const selected = resolveStudioMode(mode, import.meta.env.PROD);
  if (selected === 'demo') return createDemoServices();
  return createSupabaseServices(createStudioSupabaseClient());
}
