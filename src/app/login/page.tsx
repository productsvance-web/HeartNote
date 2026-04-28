import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">HeartNote</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to keep watch over your parent&apos;s heart failure care.
          </p>
        </div>
        <LoginForm />
        <p className="text-xs text-muted-foreground text-center">
          We&apos;ll email you a sign-in link. No password to remember.
        </p>
      </div>
    </main>
  );
}
