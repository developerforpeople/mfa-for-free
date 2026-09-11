/**
 * Form schemas, defined with Zod.
 *
 * Every form in the app validates through one of these. Two reasons for keeping
 * them in one file rather than inline in each page:
 *
 *   1. `z.infer` gives the form component its TypeScript type for free, so the
 *      schema and the type can never drift apart.
 *   2. When validation moves server-side, these schemas are the thing it
 *      reuses. Client-side validation is a convenience for the user; it is not
 *      a security control, because anyone can bypass it.
 */

import { z } from 'zod';
import { checkIdentity, isValidUsername } from './identity';

/**
 * Minimum password length.
 *
 * NIST SP 800-63B recommends length over composition rules: an 8-character
 * minimum with no forced symbols beats "must contain one uppercase, one digit
 * and one special character", which mostly produces `Password1!`.
 */
export const PASSWORD_MIN_LENGTH = 8;

const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`)
  .max(128, 'That is longer than 128 characters.');

/** Registration form. */
export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name.').max(80, 'That name is too long.'),

    username: z.string().trim().refine(isValidUsername, 'Use 3-20 letters, digits or underscores.'),

    // The identity field takes a bare name (`john`) and the service appends the
    // domain. `checkIdentity` also handles a user typing the full address.
    identity: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const result = checkIdentity(value);
        if (!result.valid) {
          ctx.addIssue({ code: 'custom', message: result.message });
        }
      }),

    password: passwordField,
    confirmPassword: z.string(),
  })
  // Cross-field checks run after the individual fields pass, and the error is
  // attached to the confirm field so it renders under the right input.
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

/**
 * Login form.
 *
 * Login takes a username, not an identity - the service resolves the username
 * to an NLR Identity before calling Firebase. Validation here is deliberately
 * loose: rejecting a badly formed username at login tells an attacker which
 * usernames are shaped correctly, and the credential check is what matters.
 */
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** Device-naming step of MFA enrollment. */
export const deviceNameSchema = z.object({
  deviceName: z
    .string()
    .trim()
    .min(2, 'Give the device a name you will recognise.')
    .max(40, 'Keep the name under 40 characters.'),
});

export type DeviceNameFormValues = z.infer<typeof deviceNameSchema>;
