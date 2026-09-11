import { Badge } from '../Badge';
import { Button } from '../Button';
import { Container } from '../Container';
import { Icon } from '../Icon';
import { siteConfig } from '@/utils/env';
import { TOTP_DIGITS, TOTP_PERIOD_SECONDS } from '@/utils/constants';

/** The six digits shown in the illustrative panel. Static - nothing is computed here. */
const SAMPLE_CODE = '042731';

/**
 * Landing hero.
 *
 * The right-hand panel is a static illustration of the verification prompt at
 * `/verify`, not a live widget - a real code would need a real enrolled device.
 * It earns its place by showing the one fact the whole project turns on: the
 * code is computed on the device and never sent in order to produce it.
 */
export function HeroSection() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-slate-200 bg-white">
      {/* Faint grid, faded out at the edges. Texture, not decoration. */}
      <div
        aria-hidden="true"
        className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
      />

      <Container className="relative grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div>
          <Badge tone="accent">
            <Icon name="book" className="h-3.5 w-3.5" />
            Open source &middot; educational
          </Badge>

          <h1 className="mt-5 text-4xl leading-[1.1] sm:text-[3rem]">NLR Identity</h1>

          <p className="mt-3 text-lg font-medium text-slate-700 sm:text-xl">
            Learn MFA. Build Secure Authentication.
          </p>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
            A beginner-friendly authentication platform that teaches how modern MFA systems work.
            Create an identity, enrol a device, and read every line that makes it happen.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button to="/register" size="lg">
              Create identity
              <Icon name="arrow-right" className="h-4 w-4" />
            </Button>
            <Button href={siteConfig.docsUrl} external size="lg" variant="secondary">
              <Icon name="book" className="h-4 w-4" />
              View documentation
            </Button>
          </div>

          <p className="mt-6 text-sm text-slate-500">
            Not a clone of any authenticator app. A teaching implementation of{' '}
            <a
              href="https://datatracker.ietf.org/doc/html/rfc6238"
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-600 underline decoration-accent-200 underline-offset-2 hover:decoration-accent-600"
            >
              RFC 6238
            </a>{' '}
            you can read end to end.
          </p>
        </div>

        {/* Illustrative verification panel. */}
        <div className="rounded-card border border-slate-200 bg-white shadow-raised">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <span className="font-mono text-xs text-slate-500">
              verification &middot; step 2 of 2
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-success-600" />
              password verified
            </span>
          </div>

          <div className="px-6 py-7">
            <h2 className="text-sm font-semibold text-navy-900">Enter the code from your device</h2>
            <p className="mt-1 text-sm text-slate-500">
              {TOTP_DIGITS} digits, valid for {TOTP_PERIOD_SECONDS} seconds.
            </p>

            <div className="mt-5 flex gap-2" aria-hidden="true">
              {SAMPLE_CODE.split('').map((digit, index) => (
                <span
                  key={index}
                  className="flex h-12 flex-1 items-center justify-center rounded border border-slate-200 bg-slate-50 font-mono text-lg text-navy-900"
                >
                  {digit}
                </span>
              ))}
            </div>

            <dl className="mt-6 space-y-2.5 border-t border-slate-200 pt-5 text-xs">
              {[
                ['Generated', 'On your device, offline'],
                ['Transmitted to generate', 'Nothing'],
                ['Stored anywhere', 'Never'],
              ].map(([term, value]) => (
                <div key={term} className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">{term}</dt>
                  <dd className="flex items-center gap-1.5 font-mono text-slate-700">
                    <Icon name="check" className="h-3.5 w-3.5 text-success-600" />
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
            Illustration of the real prompt. Create an identity to try it.
          </p>
        </div>
      </Container>
    </section>
  );
}
