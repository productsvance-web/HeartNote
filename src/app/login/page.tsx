import { Heart, AlertCircle } from 'lucide-react';
import { LoginForm } from './login-form';

function friendlyError(raw: string): string {
  if (raw.includes('PKCE code verifier not found')) {
    return "It looks like you opened the sign-in link on a different device or browser than where you started. For security, the link only works on the same device. Send a new link from this device and click it here.";
  }
  if (raw.includes('expired')) {
    return 'That sign-in link expired. Send a fresh one — they\'re only valid for a short window.';
  }
  if (raw.includes('already used') || raw.includes('once')) {
    return 'That sign-in link has already been used. Send a new one.';
  }
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-b from-cream to-background">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <div
            className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center shadow-soft"
            style={{
              background:
                'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 60%, white))',
            }}
            aria-hidden
          >
            <Heart size={26} className="text-white" fill="currentColor" />
          </div>
          <h1 className="font-display text-4xl text-foreground">HeartNote</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            A quieter way to keep watch over a parent with heart failure. Sign in to get started.
          </p>
        </div>

        {error && (
          <div
            className="rounded-2xl p-4 flex gap-3 items-start"
            style={{
              background: 'var(--status-alert-soft)',
              color: 'var(--status-alert-foreground)',
            }}
          >
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">{friendlyError(error)}</p>
          </div>
        )}

        <div className="bg-card rounded-3xl shadow-card p-6 animate-fade-up">
          <LoginForm />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          We&apos;ll email you a sign-in link. No password to remember. Open it on the same device.
        </p>
      </div>
    </main>
  );
}
