import { Badge } from '../Badge';
import { CodeBlock } from '../CodeBlock';
import { Container } from '../Container';
import { Icon } from '../Icon';
import { SectionHeading } from '../SectionHeading';
import { describeFirebaseStatus, getFirebaseStatus } from '@/firebase/config';
import { siteConfig } from '@/utils/env';

const steps = [
  {
    title: 'Clone the repository',
    body: 'Requires Node.js 20.19+ or 22.12+. To enrol a device you can use any authenticator app - Google Authenticator, Microsoft Authenticator, or 1Password.',
    label: 'bash',
    lines: [
      '# Clone and enter the demo website',
      'git clone https://github.com/developerforpeople/mfa-for-free.git',
      'cd mfa-for-free/demo-website',
      '',
      'npm install',
    ],
  },
  {
    title: 'Configure Firebase',
    body: 'Needed for registration and sign-in. Copy the example file, add your project values, then enable Email/Password in the Firebase console and deploy firestore.rules. .env.local is git-ignored, so your keys stay out of version control.',
    label: 'bash',
    lines: [
      '# Create your local environment file',
      'cp .env.example .env.local',
      '',
      '# Then edit .env.local:',
      '#   VITE_FIREBASE_PROJECT_ID=your-project-id',
      '#   VITE_FIREBASE_API_KEY=...',
      '',
      '# Prefer the emulator while developing - no billing, no live data',
      'VITE_FIREBASE_USE_EMULATOR=true',
      '',
      '# Then, once per project:',
      'firebase deploy --only firestore:rules',
    ],
  },
  {
    title: 'Run the project',
    body: 'The dev server starts on port 5173 with hot reload. Run the checks before you open a pull request - CI runs the same three commands.',
    label: 'bash',
    lines: [
      'npm run dev        # http://localhost:5173',
      '',
      '# Before pushing',
      'npm run lint',
      'npm run typecheck',
      'npm run build',
    ],
  },
];

export function DeveloperSection() {
  const status = getFirebaseStatus();

  return (
    <section id="developers" className="bg-slate-50 py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="Get started"
          title="Run it locally in three steps"
          description="Clone, configure, run. The landing page works with no configuration; creating an identity and enrolling a device need a Firebase project."
        />

        {/* Live configuration state, so a fresh clone explains itself instead of
            failing silently the first time someone expects data. */}
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-card border border-slate-200 bg-white px-4 py-3">
          <Badge tone={status === 'not-configured' ? 'warning' : 'success'}>
            <Icon name={status === 'not-configured' ? 'lock' : 'check'} className="h-3.5 w-3.5" />
            {status === 'not-configured' ? 'Not configured' : 'Configured'}
          </Badge>
          <p className="text-sm text-slate-600">{describeFirebaseStatus()}</p>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="flex flex-col">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white font-mono text-xs text-slate-500">
                  {index + 1}
                </span>
                <h3 className="text-[0.9375rem] font-semibold text-navy-900">{step.title}</h3>
              </div>
              <p className="mt-2.5 mb-4 flex-1 text-sm leading-relaxed text-slate-600">
                {step.body}
              </p>
              <CodeBlock lines={step.lines} label={step.label} />
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-card border border-slate-200 bg-white p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <h3 className="text-[0.9375rem] font-semibold text-navy-900">
              Contributions are welcome, including your first one
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
              Documentation fixes count. So does asking why something works - in this repository
              that usually means the explanation needs improving. Read CONTRIBUTING.md, then pick up
              an issue labelled good first issue.
            </p>
          </div>
          <a
            href={siteConfig.githubUrl + '/blob/main/CONTRIBUTING.md'}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-700 sm:mt-0"
          >
            Contributing guide
            <Icon name="arrow-right" className="h-4 w-4" />
          </a>
        </div>
      </Container>
    </section>
  );
}
