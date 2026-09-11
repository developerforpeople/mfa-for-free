import { Container } from './Container';
import { Icon } from './Icon';
import { siteConfig } from '@/utils/env';

const docLinks = [
  { label: 'Architecture', href: 'docs/architecture.md' },
  { label: 'Authentication flow', href: 'docs/authentication-flow.md' },
  { label: 'What MFA is', href: 'docs/mfa-explanation.md' },
  { label: 'How TOTP works', href: 'docs/totp-working.md' },
  { label: 'Database design', href: 'docs/database-design.md' },
  { label: 'Firebase setup', href: 'docs/firebase-setup.md' },
  {
    label: 'Server-side verification',
    href: 'examples/integration-examples/firebase-cloud-functions.md',
  },
] as const;

const projectLinks = [
  { label: 'Customising guide', href: 'CUSTOMISING.md' },
  { label: 'Contributing', href: 'CONTRIBUTING.md' },
  { label: 'Security policy', href: 'SECURITY.md' },
  { label: 'Code of conduct', href: 'CODE_OF_CONDUCT.md' },
  { label: 'License (MIT)', href: 'LICENSE' },
] as const;

/** Resolves a repository-relative path to a GitHub blob URL. */
function repoLink(path: string): string {
  return siteConfig.githubUrl + '/blob/main/' + path;
}

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-navy-900 text-slate-300">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white">
              <Icon name="shield" className="h-4 w-4" />
            </span>
            <span className="text-[0.9375rem] font-semibold text-white">NLR Identity</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
            An open-source educational MFA platform. Read the code, follow the flow, and understand
            how authentication systems actually work.
          </p>
          <p className="mt-4 max-w-sm rounded border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200/90">
            Educational software. Not audited, and not intended for production authentication.
          </p>
        </div>

        <nav aria-label="Documentation">
          <h2 className="text-xs font-semibold tracking-[0.08em] text-white uppercase">
            Documentation
          </h2>
          <ul className="mt-3 space-y-2">
            {docLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={repoLink(link.href)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Project">
          <h2 className="text-xs font-semibold tracking-[0.08em] text-white uppercase">Project</h2>
          <ul className="mt-3 space-y-2">
            {projectLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={repoLink(link.href)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>MIT licensed. Built for students learning authentication.</p>
          <p>Not affiliated with, or a clone of, any commercial authenticator application.</p>
        </Container>
      </div>
    </footer>
  );
}
