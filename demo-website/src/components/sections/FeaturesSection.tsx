import { Container } from '../Container';
import { FeatureCard, type FeatureCardProps } from '../FeatureCard';
import { SectionHeading } from '../SectionHeading';

/**
 * The four capabilities the platform teaches.
 *
 * All four are built and working. The labels say where each one runs, because
 * that is the interesting distinction - the website holds the secret and
 * verifies, the phone computes the code offline.
 */
const features: FeatureCardProps[] = [
  {
    icon: 'shield',
    title: 'NLR Identity Account',
    description:
      'An identity issued on a closed domain, backed by Firebase Authentication with the profile stored in Firestore.',
    phase: 'On this site',
  },
  {
    icon: 'qr',
    title: 'QR Device Enrollment',
    description:
      'Link a device by scanning an otpauth:// QR code. The shared secret crosses the boundary exactly once, then never again.',
    phase: 'On this site',
  },
  {
    icon: 'clock',
    title: 'Offline OTP Authentication',
    description:
      'Codes derived from the secret and the clock using HMAC. No network, no round trip, no code in flight to intercept.',
    phase: 'In the mobile app',
  },
  {
    icon: 'lock',
    title: 'Encrypted Device Security',
    description:
      'The seed stored under AES-GCM with the key held by the platform keystore, so a stolen phone is not a stolen identity.',
    phase: 'In the mobile app',
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="border-b border-slate-200 bg-slate-50 py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="What you will build"
          title="The pieces of a real MFA system"
          description="Each feature exists to teach one mechanism. Together they add up to the authentication flow you have used a hundred times without seeing inside."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </Container>
    </section>
  );
}
