import { Heart } from 'lucide-react';
import { SignupForm } from './signup-form';

export default function SignupPage() {
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
          <h1 className="font-display text-4xl text-foreground">Create your account</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            A quieter way to keep watch over a parent with heart failure.
          </p>
        </div>

        <div className="bg-card rounded-3xl shadow-card p-6 animate-fade-up">
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
