import { Container } from '../Container';
import { FlowDiagram, type FlowStep } from '../FlowDiagram';
import { Icon } from '../Icon';
import { SectionHeading } from '../SectionHeading';
import { TOTP_DRIFT_WINDOW, TOTP_PERIOD_SECONDS } from '@/utils/constants';

/** The end-to-end flow, matching docs/authentication-flow.md. */
const flow: FlowStep[] = [
  {
    actor: 'User',
    title: 'Sign in with the first factor',
    description:
      'Email and password. This must succeed before anything else happens - you cannot attach a device to an account you have not proven you own.',
    transfers: 'credentials over TLS',
  },
  {
    actor: 'Server',
    title: 'Generate the shared secret',
    description:
      'Twenty random bytes, stored encrypted and attached to a device in pending state. Generated server-side, because the server needs the value to verify codes later.',
  },
  {
    actor: 'Website',
    title: 'Render the enrollment QR code',
    description:
      'An otpauth:// URI, displayed exactly once and expiring in minutes. A secret you can re-display is a secret an attacker can re-steal.',
    transfers: 'secret, one time only',
  },
  {
    actor: 'Device',
    title: 'Scan, encrypt, and store',
    description:
      'The authenticator parses the URI, encrypts the secret with AES-GCM, and writes it to storage with the key held in the platform keystore.',
  },
  {
    actor: 'Device',
    title: 'Generate the code locally',
    description:
      'HMAC over the secret and the current time step, truncated to six digits. Nothing is transmitted to produce it, so there is nothing in flight to intercept.',
    transfers: 'nothing',
    offline: true,
  },
  {
    actor: 'Server',
    title: 'Verify independently',
    description:
      'The server computes the expected code from its own copy of the secret and compares in constant time, then marks that counter used so it cannot be replayed.',
    transfers: 'the typed code, compared then discarded',
  },
];

const principles = [
  {
    icon: 'clock' as const,
    title: 'OTPs are never stored',
    body: 'Not in the database, not in a log line, not in a cache. A code that exists at rest is a code an attacker can read.',
  },
  {
    icon: 'devices' as const,
    title: 'OTPs are generated locally',
    body: 'The authenticator computes the code on the device. The server never sends one, so there is no code in transit to steal.',
  },
  {
    icon: 'lock' as const,
    title: 'Device secrets are encrypted',
    body: 'AES-GCM at rest with the key in the OS keystore. Losing the phone does not hand over the second factor.',
  },
  {
    icon: 'shield' as const,
    title: 'Authentication works offline',
    body: `Time is the only shared input. A ${String(TOTP_PERIOD_SECONDS)}-second step, plus or minus ${String(TOTP_DRIFT_WINDOW)} for clock drift, is the whole synchronisation protocol.`,
  },
];

export function ArchitectureSection() {
  return (
    <section id="architecture" className="border-b border-slate-200 bg-white py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Architecture"
          title="How the handshake actually works"
          description="Six steps from an empty account to a verified session. Notice step five: the device does its work with no connection at all."
        />

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div className="rounded-card border border-slate-200 bg-white p-6 sm:p-7">
            <FlowDiagram steps={flow} />
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-[0.08em] text-accent-600 uppercase">
              Security principles
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
              These four rules constrain every design decision in the project. A change that breaks
              one of them is a bug, whatever else it does.
            </p>

            <ul className="mt-6 space-y-5">
              {principles.map((principle) => (
                <li key={principle.title} className="flex gap-3.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-accent-600">
                    <Icon name={principle.icon} className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-navy-900">{principle.title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{principle.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
