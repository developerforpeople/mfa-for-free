import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from './Alert';
import { Container } from './Container';
import { getFirebaseStatus } from '@/firebase/config';

export type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  /** Link shown under the card: "Already have an identity? Sign in". */
  footer?: { text: string; linkLabel: string; to: string };
};

/**
 * Shared layout for the sign-in and registration pages.
 *
 * Deliberately narrow (max ~26rem) and left-aligned inside the card. Centred
 * body text in a form is a marketing-page habit; forms read better aligned to
 * the same edge as the inputs.
 */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  const notConfigured = getFirebaseStatus() === 'not-configured';

  return (
    <div className="bg-slate-50 py-12 sm:py-16">
      <Container className="max-w-md">
        {/* A fresh clone has no Firebase project. Say so before the user fills
            in a form that cannot possibly submit. */}
        {notConfigured && (
          <Alert tone="warning" title="Firebase is not configured" className="mb-5">
            Copy <code className="font-mono">.env.example</code> to{' '}
            <code className="font-mono">.env.local</code>, add your Firebase project values, and
            restart the dev server. Registration and sign-in need a project to talk to.
          </Alert>
        )}

        <div className="rounded-card border border-slate-200 bg-white p-6 sm:p-7">
          <h1 className="text-xl">{title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>

          <div className="mt-6">{children}</div>
        </div>

        {footer !== undefined && (
          <p className="mt-5 text-center text-sm text-slate-600">
            {footer.text}{' '}
            <Link
              to={footer.to}
              className="font-medium text-accent-600 underline decoration-accent-200 underline-offset-2 hover:decoration-accent-600"
            >
              {footer.linkLabel}
            </Link>
          </p>
        )}
      </Container>
    </div>
  );
}
