import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { loginWithUsername } from '@/services/userService';
import { loginSchema, type LoginFormValues } from '@/utils/validation';

/** Route state set by ProtectedRoute when it bounces someone to sign in. */
type LocationState = { from?: string } | null;

/**
 * Sign-in.
 *
 * Username and password, per the spec. Firebase authenticates with an email
 * address, so `loginWithUsername` resolves the username to an NLR Identity
 * first - see `services/userService.ts`.
 *
 * One thing this page deliberately does not do: distinguish "no such username"
 * from "wrong password". Both produce the same message. Telling an attacker
 * which usernames exist is free reconnaissance, and it costs a legitimate user
 * nothing to see one message instead of two.
 */
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Where the user was heading before the guard redirected them here.
  const redirectTo = (location.state as LocationState)?.from ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);

    try {
      await loginWithUsername(values.username, values.password);
      void navigate(redirectTo, { replace: true });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
    }
  }

  return (
    <AuthCard
      title="Sign in"
      description="Use the username you chose when you created your NLR Identity."
      footer={{ text: 'No identity yet?', linkLabel: 'Create one', to: '/register' }}
    >
      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
        className="space-y-4"
      >
        {submitError !== null && <Alert tone="error">{submitError}</Alert>}

        <Input
          label="Username"
          autoComplete="username"
          placeholder="john123"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.username?.message}
          {...register('username')}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Sign in
        </Button>

        <p className="border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
          If you have a confirmed device, you will be asked for a code from it after this step.
          Lost the device? The next screen accepts a recovery code instead.
        </p>
      </form>
    </AuthCard>
  );
}
