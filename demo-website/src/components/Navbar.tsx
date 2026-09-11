import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { Container } from './Container';
import { Icon } from './Icon';
import { useAuth } from '@/context/useAuth';
import { firstNameOf } from '@/utils/identity';
import { siteConfig } from '@/utils/env';
import { cn } from '@/utils/cn';

/**
 * Site navigation.
 *
 * Auth-aware: signed-out visitors get the marketing links and sign-in actions,
 * signed-in users get the app links and a sign-out button.
 */
export function Navbar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const signedIn = user !== null;
  const displayName = profile?.name ?? user?.displayName ?? '';

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      void navigate('/');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/85 backdrop-blur-sm">
      <Container className="flex h-14 items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-navy-900 text-white">
            <Icon name="shield" className="h-4 w-4" />
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-tight text-navy-900">
            NLR Identity
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {signedIn ? (
            <>
              <NavItem to="/dashboard">Dashboard</NavItem>
              <NavItem to="/mfa-setup">MFA setup</NavItem>
            </>
          ) : (
            <>
              <a
                href="/#features"
                className="rounded px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy-900"
              >
                Features
              </a>
              <a
                href={siteConfig.docsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy-900"
              >
                Documentation
              </a>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              {displayName !== '' && (
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {firstNameOf(displayName)}
                </span>
              )}
              <Button
                variant="secondary"
                size="md"
                onClick={() => void handleSignOut()}
                loading={signingOut}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button to="/login" variant="ghost">
                Sign in
              </Button>
              <Button to="/register" variant="primary">
                Create identity
              </Button>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}

/** Navigation link that marks itself as current for the active route. */
function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'rounded px-2.5 py-1.5 text-sm transition-colors',
          isActive
            ? 'bg-slate-100 font-medium text-navy-900'
            : 'text-slate-600 hover:bg-slate-100 hover:text-navy-900',
        )
      }
    >
      {children}
    </NavLink>
  );
}
