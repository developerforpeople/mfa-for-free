import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { registerIdentity } from '@/services/userService';
import { registerSchema, type RegisterFormValues } from '@/utils/validation';
import { NLR_DOMAIN, toLocalPart } from '@/utils/identity';

/**
 * Registration.
 *
 * Four fields plus confirmation. The identity field is the interesting one: the
 * user types `john` and the platform issues `john@nlr.com`. The domain is shown
 * as a fixed suffix on the input rather than left to the user to type, which
 * makes the rule visible instead of something you discover by failing.
 *
 * Validation runs through Zod (`utils/validation.ts`), so the schema and the
 * form's TypeScript type cannot drift apart.
 */
export function Register() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    // Validate on blur rather than on every keystroke: errors that appear while
    // you are still typing the first three characters are just noise.
    mode: 'onBlur',
    defaultValues: { name: '', username: '', identity: '', password: '', confirmPassword: '' },
  });

  // Live preview of the identity that will be issued.
  const identityPreview = toLocalPart(watch('identity') ?? '');

  async function onSubmit(values: RegisterFormValues) {
    setSubmitError(null);

    try {
      await registerIdentity({
        name: values.name,
        username: values.username,
        identity: values.identity,
        password: values.password,
      });

      // The auth listener in AuthProvider has already picked up the new session,
      // so the dashboard has everything it needs.
      void navigate('/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Registration failed. Please try again.',
      );
    }
  }

  return (
    <AuthCard
      title="Create your NLR Identity"
      description="An NLR Identity is issued on a closed domain, the way a work account is issued by an employer. Pick a name and the platform issues the address."
      footer={{ text: 'Already have an identity?', linkLabel: 'Sign in', to: '/login' }}
    >
      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
        className="space-y-4"
      >
        {submitError !== null && <Alert tone="error">{submitError}</Alert>}

        <Input
          label="Full name"
          autoComplete="name"
          placeholder="John Doe"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Username"
          autoComplete="username"
          placeholder="john123"
          error={errors.username?.message}
          hint="You will sign in with this. 3-20 letters, digits or underscores."
          {...register('username')}
        />

        <Input
          label="NLR Identity"
          placeholder="john"
          suffix={`@${NLR_DOMAIN}`}
          autoCapitalize="none"
          spellCheck={false}
          error={errors.identity?.message}
          hint={
            identityPreview === '' ? (
              <>Type the name only. Public domains such as gmail.com are not accepted.</>
            ) : (
              <>
                Your identity will be{' '}
                <span className="font-mono text-navy-900">
                  {identityPreview}@{NLR_DOMAIN}
                </span>
              </>
            )
          }
          {...register('identity')}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          hint="At least 8 characters. Length beats punctuation."
          {...register('password')}
        />

        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Create identity
        </Button>

        <p className="text-xs leading-relaxed text-slate-500">
          This is a demo of an educational project. Do not reuse a password from a real account
          here.
        </p>
      </form>
    </AuthCard>
  );
}
