'use client';

import { useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { deleteAccount } from './actions';

function buildConfirmMessage(email: string) {
  return `This will permanently delete ${email} and all data. Continue?`;
}

function ButtonInner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-medium border border-destructive/30 bg-card text-destructive disabled:opacity-50"
    >
      <Trash2 size={16} />
      {pending ? 'Deleting…' : 'Delete account'}
    </button>
  );
}

function LinkInner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-muted-foreground underline disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Delete account and start over'}
    </button>
  );
}

function FormShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <form
      action={deleteAccount}
      onSubmit={(e) => {
        if (!window.confirm(buildConfirmMessage(email))) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

export function DeleteAccountButton({ email }: { email: string }) {
  return (
    <FormShell email={email}>
      <ButtonInner />
    </FormShell>
  );
}

export function DeleteAccountLink({ email }: { email: string }) {
  return (
    <FormShell email={email}>
      <LinkInner />
    </FormShell>
  );
}
