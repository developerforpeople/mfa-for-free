# Contributing to NLR Identity

Thanks for being here. NLR Identity is a teaching project, so contributions are judged on two
things: does the code work, and will a student learning authentication understand it six months
from now. A clear pull request from a first-time contributor is worth more here than a clever one.

## Ways to Contribute

You do not have to write cryptography to be useful.

- **Documentation** — fix a confusing paragraph, add a diagram, correct a technical detail.
- **Examples** — add an integration example for a framework we do not cover yet.
- **UI work** — improve accessibility, keyboard navigation, or responsive behaviour.
- **Code** — pick up an issue labelled `good first issue` or `help wanted`.
- **Review** — read someone else's PR and ask the questions you had when you first read the code.

## Before You Start

1. **Open an issue first** for anything larger than a typo fix. It saves you from building
   something we were planning to design differently.
2. **Read [CUSTOMISING.md](CUSTOMISING.md) before touching authentication code.** It marks which
   files are design and which are load-bearing, and a PR that changes the TOTP engine needs to
   explain why the RFC tests still pass.
3. **One concern per pull request.** A PR that fixes a bug *and* refactors a folder is two PRs.

## Development Setup

```bash
git clone https://github.com/developerforpeople/mfa-for-free.git
cd mfa-for-free/demo-website
npm install
cp .env.example .env.local
npm run dev
```

Before you push:

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # RFC conformance and security tests
npm run build      # must succeed
```

All four must pass. CI runs the same commands.

## Branch and Commit Conventions

Branch names: `type/short-description` — for example `docs/clarify-totp-drift` or
`feat/enrollment-card`.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(demo): add architecture flow section to landing page
fix(utils): correct base32 padding for odd-length secrets
docs(totp): explain why the time step is 30 seconds
chore(deps): bump vite to 7.1
refactor(components): extract Button variants
test(services): cover identity creation failure path
```

Scopes in use: `demo`, `docs`, `app`, `examples`, `ci`, `deps`.

## Code Standards

### TypeScript

- **No `any`.** If a type is genuinely unknown, use `unknown` and narrow it.
- Prefer `type` aliases for props and unions; use `interface` when a shape is meant to be extended.
- Export the props type alongside every component: `export type ButtonProps = { ... }`.
- Use `import type { X } from '...'` for type-only imports.
- Keep functions small enough to read without scrolling.

### React

- Function components only, with named exports.
- One component per file; the filename matches the component (`FeatureCard.tsx`).
- Reusable, presentational pieces go in `src/components/`. Route-level compositions go in
  `src/pages/`.
- Data access goes in `src/services/` — components never call Firebase directly.
- Pure helpers go in `src/utils/` and should be testable without React.

### Styling

- Tailwind utility classes in JSX. No inline `style` objects except for genuinely dynamic values.
- Use the design tokens defined in `src/styles/index.css` (`brand-navy`, `brand-blue`, `slate`,
  and friends) rather than raw hex values.
- Read [the design system rules](#design-system) below before adding new visual patterns.

### Comments

Comment the **why**, not the what. This is a teaching repository, so a short paragraph explaining a
security decision is welcome and a comment that restates the line below it is not.

```ts
// The secret is shown exactly once. If the user loses it here they re-enroll,
// because a secret that can be re-displayed can also be re-stolen.
```

## Design System

The project deliberately avoids a generic AI-generated startup look. Contributions should match the
tone of GitHub, Cloudflare, Linear, and the Stripe docs.

**Use:**

| Token | Value | Use |
|---|---|---|
| Deep navy | `#0B1F3A` | Headings, primary surfaces, footer |
| Professional blue | `#1F6FEB` | Primary actions, links, focus rings |
| Slate gray | `#475569` | Body copy, secondary text |
| Off-white | `#F8FAFC` | Page background, alternating sections |
| Border | `#E2E8F0` | Hairline rules and card outlines |

Typography is Inter with a system-font fallback stack. Body text sits at 15–16px with generous
line height.

**Avoid:**

- Neon or multi-stop gradients
- Glassmorphism, heavy blurs, glow effects
- Decorative AI-generated illustrations
- Large border radii — cards use 6–8px, not pills
- Emoji as UI iconography in the product surface
- Marketing-speak headlines; write like documentation

## Security Contributions

Do not open a public issue or PR for a vulnerability. Follow [SECURITY.md](SECURITY.md).

For everything else security-adjacent: if you change how a secret is generated, stored, transmitted,
or destroyed, say so explicitly in the PR description and explain the threat model you considered.

## Pull Request Checklist

- [ ] Linked to an issue (or is a trivial fix)
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` all pass
- [ ] New code has comments explaining non-obvious decisions
- [ ] Documentation updated if behaviour or structure changed
- [ ] No secrets, tokens, or real Firebase credentials committed
- [ ] Screenshots included for UI changes

## Code of Conduct

Be patient with beginners; most people here are learning this material for the first time. Critique
code, not people. Maintainers may close or block anyone who makes the project unpleasant to
participate in.

## Questions

Open an [issue](https://github.com/developerforpeople/mfa-for-free/issues) or ask in the one you are working on. "I don't understand why this works" is a legitimate issue in this repository — it
usually means the documentation needs improving.
