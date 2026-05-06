import type { Metadata } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';
import { PwaElementsBootstrap } from '@/components/PwaElementsBootstrap';
import { MedicationNotificationsBootstrap } from '@/components/MedicationNotificationsBootstrap';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: 'HeartNote — daily heart-failure check-ins for caregivers',
  description:
    "Voice-first daily logging, AI trend detection, and red-alert warnings for adult-child caregivers of parents with congestive heart failure.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PwaElementsBootstrap />
        <MedicationNotificationsBootstrap />
        {children}
      </body>
    </html>
  );
}
