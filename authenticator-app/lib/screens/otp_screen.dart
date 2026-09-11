import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/services/totp_service.dart';
import 'package:nlr_authenticator/state/identity_store.dart';
import 'package:nlr_authenticator/widgets/timer_progress.dart';

/// One identity, full screen, with its code large enough to read and type.
///
/// This screen exists because the home list is dense: when you are actually
/// transcribing a code into a login form, you want the digits big and the
/// countdown unambiguous.
class OtpScreen extends StatelessWidget {
  const OtpScreen({super.key, required this.identityId});

  final String identityId;

  @override
  Widget build(BuildContext context) {
    final store = context.watch<IdentityStore>();
    final identity = store.byId(identityId);

    // The identity can vanish while this screen is open - removed from the
    // sheet on the previous screen, for instance. Handle it rather than
    // dereferencing null.
    if (identity == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Identity')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Text(
              'This identity is no longer on this device.',
              textAlign: TextAlign.center,
              style: TextStyle(color: NlrColors.slate500),
            ),
          ),
        ),
      );
    }

    final code = store.codeFor(identity);
    final error = store.decryptionErrorFor(identity);
    final remaining = store.secondsRemaining(identity);

    return Scaffold(
      appBar: AppBar(title: const Text('NLR Identity')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 26,
                ),
                child: Column(
                  children: [
                    Text(
                      identity.displayName,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: NlrColors.navy,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      identity.email,
                      style: const TextStyle(
                        fontSize: 13.5,
                        color: NlrColors.slate500,
                      ),
                      textAlign: TextAlign.center,
                    ),

                    const SizedBox(height: 26),

                    if (code != null) ...[
                      Text(
                        'Current code',
                        style: const TextStyle(
                          fontSize: 11.5,
                          letterSpacing: 1.1,
                          fontWeight: FontWeight.w600,
                          color: NlrColors.slate400,
                        ),
                      ),
                      const SizedBox(height: 10),
                      SelectableText(
                        TotpService.formatForDisplay(code),
                        style: NlrTheme.codeStyle.copyWith(fontSize: 44),
                        textAlign: TextAlign.center,
                        semanticsLabel: code.split('').join(' '),
                      ),
                      const SizedBox(height: 20),

                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          TimerProgress(
                            period: identity.period,
                            size: 30,
                            showSeconds: false,
                          ),
                          const SizedBox(width: 10),
                          Text(
                            'Expires in $remaining '
                            '${remaining == 1 ? 'second' : 'seconds'}',
                            style: TextStyle(
                              fontSize: 13.5,
                              color: remaining <= 5
                                  ? NlrColors.expiring
                                  : NlrColors.slate500,
                              fontWeight: remaining <= 5
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      LinearTimerProgress(period: identity.period),
                      const SizedBox(height: 22),

                      FilledButton.icon(
                        onPressed: () => _copy(context, code, identity.email),
                        icon: const Icon(Icons.copy_all_outlined, size: 18),
                        label: const Text('Copy code'),
                      ),
                    ] else
                      _Unavailable(message: error),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            Card(
              child: Column(
                children: [
                  _InfoRow(label: 'Issuer', value: identity.issuer),
                  const Divider(height: 1),
                  _InfoRow(label: 'Device', value: identity.deviceName),
                  const Divider(height: 1),
                  _InfoRow(
                    label: 'Algorithm',
                    value:
                        '${identity.algorithm.label} · ${identity.digits} digits '
                        '· ${identity.period}s',
                  ),
                  const Divider(height: 1),
                  _InfoRow(
                    label: 'Enrolled',
                    value: _formatDateTime(identity.createdDate),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 18),

            const _OfflineNotice(),

            const SizedBox(height: 16),

            TextButton.icon(
              onPressed: () => _confirmRemoval(context, identityId),
              icon: const Icon(Icons.delete_outline, size: 18),
              label: const Text('Remove this identity'),
              style: TextButton.styleFrom(foregroundColor: NlrColors.danger),
            ),
          ],
        ),
      ),
    );
  }

  void _copy(BuildContext context, String code, String email) {
    Clipboard.setData(ClipboardData(text: code));
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Code copied for $email'),
          duration: const Duration(seconds: 2),
        ),
      );
  }

  Future<void> _confirmRemoval(BuildContext context, String id) async {
    final store = context.read<IdentityStore>();
    final router = GoRouter.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove this identity?'),
        content: const Text(
          'The secret for this identity is deleted from this device and cannot '
          'be recovered by this app. To use it again, scan a new QR code from '
          'the NLR Identity website.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: TextButton.styleFrom(foregroundColor: NlrColors.danger),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    await store.remove(id);
    // `router` was captured before the await, so this does not touch a
    // BuildContext across an async gap.
    router.go('/home');
  }

  static String _formatDateTime(DateTime value) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(value.day)}/${two(value.month)}/${value.year} '
        '${two(value.hour)}:${two(value.minute)}';
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Icon(Icons.lock_outline, size: 30, color: NlrColors.warning),
        const SizedBox(height: 12),
        const Text(
          'No code available',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: NlrColors.navy,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          message ??
              'The stored secret for this identity could not be decrypted.',
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 13,
            height: 1.45,
            color: NlrColors.slate500,
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 82,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: NlrColors.slate500),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13.5, color: NlrColors.navy),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

class _OfflineNotice extends StatelessWidget {
  const _OfflineNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: NlrColors.accentSoft,
        borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
        border: Border.all(color: const Color(0xFFD6E2FF)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.wifi_off_outlined, size: 17, color: NlrColors.accent),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'This code was calculated on this device, from the stored secret '
              'and the current time. Nothing was sent or received to produce '
              'it - turn off your connection and it still works.',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.5,
                color: Color(0xFF1B3D7C),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
