import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useSearch } from 'wouter';
import { safeReturnPath } from '@/lib/return-path';
import { ArrowRight, Loader2, Lock } from 'lucide-react';
import { Wordmark } from '@/components/brand/logo';
import { ScopeMarker } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEnterDemo, usePageTitle, useSession } from '@/hooks/use-studio-data';
import { useServices } from '@/providers/services-provider';
import { ErrorState } from '@/components/states';
import { useToast } from '@/hooks/use-toast';

const OUTLINE = [
  { n: '1', t: 'Getting started with the Meridian X4', d: 0 },
  { n: '1.1', t: 'Site requirements', d: 1 },
  { n: '1.2', t: 'Unpack the instrument', d: 1 },
  { n: '1.2.1', t: 'Remove the transport locks', d: 2 },
  { n: '2', t: 'Running measurements', d: 0 },
  { n: '2.1', t: 'Prepare a cuvette sample', d: 1 },
];

export default function SignInPage() {
  usePageTitle('Sign in', 'Sign in to SPEXTAR Studio, structured authoring for technical writers.');
  const enter = useEnterDemo();
  const sessionState = useSession();
  const session = sessionState.data;
  const { mode } = useServices();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const returnPath = safeReturnPath(new URLSearchParams(search).get('returnTo'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const onSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    setSigningIn(true);
    try {
      await sessionState.signIn(email, password);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not sign in. Please retry.');
    } finally {
      setPassword('');
      setSigningIn(false);
    }
  };
  useEffect(() => {
    if (session) navigate(returnPath, { replace: true });
  }, [session, navigate, returnPath]);

  const onEnter = () =>
    enter.mutate(undefined, {
      onSuccess: () => navigate(returnPath, { replace: true }),
      onError: () => toast({ title: 'Could not start demo session', variant: 'destructive' }),
    });

  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-border bg-[hsl(var(--sidebar))] p-12 text-white dark:bg-card lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#6236FF]/20 blur-[120px]" aria-hidden />
        <Wordmark tone="light" />
        <div className="relative mt-auto max-w-md">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[hsl(253_100%_80%)]">Structured authoring</p>
          <h2 className="mt-4 text-[40px] font-semibold leading-[1.08] tracking-tight">
            Structure first.
            <br />
            <span className="text-white/55">Then every sentence has a place.</span>
          </h2>
          <div className="mt-10 rounded-lg border border-white/10 bg-white/[0.03] p-5 font-mono text-[12.5px]" aria-hidden>
            {OUTLINE.map((o, i) => (
              <div key={o.n} className="flex gap-3 py-1 fade-up" style={{ paddingLeft: o.d * 18, animationDelay: `${200 + i * 70}ms` }}>
                <span className="w-10 text-white/35">{o.n}</span>
                <span className={o.d === 0 ? 'text-white' : 'text-white/65'}>{o.t}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative mt-12 text-xs text-white/35">Topics · Documents · Review · Publish</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px] rounded-xl border border-border bg-card p-7 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.6)] fade-up sm:p-8">
          <Wordmark />
          <div className="mt-6 flex items-center gap-2">
            {mode === 'demo' ? <ScopeMarker kind="demo">Demo environment</ScopeMarker>
              : <span className="text-xs text-muted-foreground" data-testid="backend-environment">Secure workspace · Supabase</span>}
          </div>
          <h1 className="mt-4 text-[24px] font-semibold tracking-tight">Sign in to SPEXTAR</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === 'demo' ? 'Isolated local demo workspace' : 'Secure organization workspace'}
          </p>

          <form onSubmit={onSignIn} className="mt-6" aria-label="Email and password sign-in">
          <fieldset disabled={mode === 'demo' || signingIn || sessionState.isLoading || sessionState.isSigningOut} className="space-y-4" aria-describedby="credential-note">
            <legend className="sr-only">Email and password</legend>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-muted-foreground">Work email</Label>
              <Input id="email" type="email" required={mode === 'backend'} placeholder="name@company.com" autoComplete={mode === 'backend' ? 'username' : 'off'} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-muted-foreground">Password</Label>
              <Input id="password" type="password" required={mode === 'backend'} placeholder={mode === 'backend' ? 'Enter your password' : 'Demo mode — no credentials'} autoComplete={mode === 'backend' ? 'current-password' : 'off'} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" />
            </div>
          </fieldset>
          <p id="credential-note" className="mt-3 flex items-start gap-2 rounded-md border border-border bg-[hsl(var(--surface-raised))] px-3 py-2 text-[12.5px] text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {mode === 'demo' ? 'Credential sign-in is disabled in demo mode. No passwords are accepted or stored.'
              : 'Sign in with your existing account. Credentials are sent securely to Supabase, not stored by Studio.'}
          </p>
          {authError && <p role="alert" className="mt-3 text-sm text-destructive" data-testid="auth-error">{authError}</p>}
          {mode === 'backend' && <>
            <Button type="submit" className="mt-5 h-11 w-full" disabled={signingIn || sessionState.isLoading || sessionState.isSigningOut} data-testid="button-sign-in">
              {signingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {signingIn ? 'Signing in…' : 'Sign in'}
            </Button>
            <div className="mt-4 grid grid-cols-2 gap-3" aria-describedby="provider-note">
              <Button type="button" variant="outline" disabled data-testid="button-microsoft">Microsoft</Button>
              <Button type="button" variant="outline" disabled data-testid="button-google">Google</Button>
            </div>
            <p id="provider-note" className="mt-2 text-xs text-muted-foreground">Microsoft and Google sign-in are not configured.</p>
          </>}
          </form>

          {sessionState.isError && <div className="mt-4"><ErrorState error={sessionState.error} onRetry={() => void sessionState.refetch()} /></div>}
          {mode === 'demo' ? <>
          <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> Demo access <span className="h-px flex-1 bg-border" />
          </div>

          <Button className="group h-11 w-full text-[14px]" onClick={onEnter} disabled={enter.isPending || sessionState.isLoading || sessionState.isError || sessionState.isSigningOut} data-testid="button-enter-demo">
            {enter.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enter demo as Ingrid Sæther
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Opens a local demo session with sample documentation. Data stays in this browser.
          </p>
          </> : null}
          {session && (
            <button
              type="button"
              onClick={() => navigate('/workspaces')}
              className="mt-6 w-full text-center text-sm text-primary underline-offset-4 hover:underline"
              data-testid="link-continue-session"
            >
              Continue as {session.name}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
