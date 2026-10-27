import { ServiceError } from './contracts';

export function backendError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  const e = error as { code?: string; status?: number; message?: string } | null;
  if (e?.code === 'invalid_credentials') return new ServiceError('Email or password is incorrect.', 'unauthorized');
  if (e?.code === 'email_not_confirmed') return new ServiceError('Confirm your email before signing in.', 'unauthorized');
  if (e?.status === 429 || e?.code === 'over_request_rate_limit') return new ServiceError('Too many attempts. Please wait before trying again.', 'unauthorized');
  if (e?.status === 401 || e?.code === 'PGRST301') return new ServiceError('Your session has expired. Please sign in again.', 'unauthorized');
  if (e?.code === '42501' || e?.status === 403) return new ServiceError('You do not have permission to access or change this resource.', 'forbidden');
  if (e?.code === '23505') return new ServiceError('This name or slug is already in use.', 'conflict');
  if (['23514', '23503', '22P02', 'P0001'].includes(e?.code ?? '')) return new ServiceError('The database rejected these metadata or hierarchy values. Check the status, parent and sibling position.', 'validation');
  if (e?.code === 'PGRST202') return new ServiceError('The required atomic database operation is unavailable. No client-side inserts were attempted.', 'unavailable');
  if (e?.code === 'PGRST205' || e?.code === '42703') return new ServiceError('The database contract does not match the required foundation. Please check the schema configuration.', 'unavailable');
  return new ServiceError('Could not reach Supabase or complete the request. Check your connection and retry.', 'network');
}
