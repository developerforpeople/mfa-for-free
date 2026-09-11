import { Button } from '@/components/Button';
import { Container } from '@/components/Container';

/** Catch-all route. Plain, and it offers a way out rather than an apology. */
export function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center bg-slate-50 py-16">
      <Container className="max-w-md text-center">
        <p className="font-mono text-sm text-slate-400">404</p>
        <h1 className="mt-2 text-2xl">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          That route does not exist. It may have moved, or the link may be wrong.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button to="/" variant="secondary">
            Back home
          </Button>
          <Button to="/dashboard">Go to dashboard</Button>
        </div>
      </Container>
    </div>
  );
}
