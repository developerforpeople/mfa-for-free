import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/state/identity_store.dart';

/// App information and the security explanation.
///
/// The security section is the point of this screen. An authenticator asks a
/// user to trust it with the thing that protects their accounts; saying plainly
/// what it does - and what it deliberately cannot do - is part of earning that.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _version = '...';

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  /// Read from the build rather than hardcoded, so the number on screen cannot
  /// drift away from the number that was actually shipped.
  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() => _version = '${info.version} (${info.buildNumber})');
    } catch (_) {
      if (!mounted) return;
      setState(() => _version = 'unknown');
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<IdentityStore>();

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
        children: [
          const _SectionLabel('SECURITY'),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: NlrColors.accentSoft,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.shield_outlined,
                          size: 18,
                          color: NlrColors.accent,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'How this app protects you',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'NLR Authenticator generates OTP locally. No OTP data '
                    'leaves this device.',
                    style: TextStyle(
                      fontSize: 13.5,
                      height: 1.5,
                      color: NlrColors.navy,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 10),

          const Card(
            child: Column(
              children: [
                _SecurityPoint(
                  icon: Icons.wifi_off_outlined,
                  title: 'Works with no connection',
                  body:
                      'Codes are calculated from the stored secret and the '
                      'current time. Release builds ship with no internet '
                      'permission at all, so this is enforced by the operating '
                      'system rather than promised here. You can verify it in '
                      'the app permission list.',
                ),
                Divider(height: 1, indent: 56),
                _SecurityPoint(
                  icon: Icons.lock_outline,
                  title: 'Secrets are encrypted at rest',
                  body:
                      'Every secret is encrypted with AES-256-GCM. The key is '
                      'held by the Android Keystore or the iOS Keychain, not '
                      'in the app\'s own files.',
                ),
                Divider(height: 1, indent: 56),
                _SecurityPoint(
                  icon: Icons.visibility_off_outlined,
                  title: 'Codes are never stored',
                  body:
                      'A code is calculated when it is shown and then '
                      'discarded. It is never written to storage, a log, or a '
                      'backup - a code that exists at rest is a code someone '
                      'can read.',
                ),
                Divider(height: 1, indent: 56),
                _SecurityPoint(
                  icon: Icons.key_off_outlined,
                  title: 'The secret is shown only once',
                  body:
                      'After enrollment the secret cannot be displayed again. '
                      'A secret you can re-display is a secret an attacker '
                      'with a moment on your phone can re-steal.',
                ),
                Divider(height: 1, indent: 56),
                _SecurityPoint(
                  icon: Icons.cloud_off_outlined,
                  title: 'Excluded from backups',
                  body:
                      'Enrollments do not ride a cloud backup onto a new '
                      'phone. That means a lost device means re-enrolling - '
                      'which is the correct trade for "something you have".',
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          const _SectionLabel('ABOUT'),

          Card(
            child: Column(
              children: [
                _InfoTile(
                  icon: Icons.info_outline,
                  label: 'App version',
                  value: _version,
                ),
                const Divider(height: 1, indent: 56),
                const _InfoTile(
                  icon: Icons.inventory_2_outlined,
                  label: 'Package',
                  value: 'com.nlr.identity.authenticator',
                ),
                const Divider(height: 1, indent: 56),
                _InfoTile(
                  icon: Icons.verified_user_outlined,
                  label: 'Identities enrolled',
                  value: '${store.identities.length}',
                ),
                const Divider(height: 1, indent: 56),
                const _InfoTile(
                  icon: Icons.calculate_outlined,
                  label: 'Algorithm',
                  value: 'TOTP · RFC 6238',
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          const _SectionLabel('EDUCATIONAL PROJECT'),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'This is a teaching implementation',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'NLR Authenticator is part of NLR Identity, an open-source '
                    'project that shows students how multi-factor '
                    'authentication actually works. It is not a clone of any '
                    'commercial authenticator, and it has not been through a '
                    'security audit.\n\n'
                    'Read the code, follow the flow, and use an established '
                    'authenticator for accounts that matter.',
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.55,
                      color: NlrColors.slate600,
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),
          const _SectionLabel('DANGER ZONE'),

          Card(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 6,
              ),
              leading: const Icon(
                Icons.delete_forever_outlined,
                color: NlrColors.danger,
                size: 21,
              ),
              title: const Text(
                'Remove all identities',
                style: TextStyle(
                  color: NlrColors.danger,
                  fontWeight: FontWeight.w600,
                  fontSize: 14.5,
                ),
              ),
              subtitle: const Text(
                'Deletes every secret and the encryption key',
                style: TextStyle(fontSize: 12.5),
              ),
              onTap: store.identities.isEmpty
                  ? null
                  : () => _confirmWipe(context, store),
              enabled: store.identities.isNotEmpty,
            ),
          ),

          const SizedBox(height: 24),

          Center(
            child: Text(
              'NLR Identity · educational MFA platform',
              style: TextStyle(fontSize: 12, color: NlrColors.slate400),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmWipe(BuildContext context, IdentityStore store) async {
    final count = store.identities.length;
    final router = GoRouter.of(context);
    final messenger = ScaffoldMessenger.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove everything?'),
        content: Text(
          'This deletes all $count '
          '${count == 1 ? 'identity' : 'identities'} and destroys the '
          'encryption key.\n\n'
          'Nothing can be recovered afterwards. If you have no recovery codes '
          'for these accounts, you may lose access to them.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: TextButton.styleFrom(foregroundColor: NlrColors.danger),
            child: const Text('Remove everything'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    await store.removeAll();

    messenger.showSnackBar(
      const SnackBar(content: Text('All identities removed')),
    );
    router.go('/home');
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 11,
          letterSpacing: 0.9,
          fontWeight: FontWeight.w600,
          color: NlrColors.slate400,
        ),
      ),
    );
  }
}

class _SecurityPoint extends StatelessWidget {
  const _SecurityPoint({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 28,
            child: Icon(icon, size: 19, color: NlrColors.slate500),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: NlrColors.navy,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(
                    fontSize: 12.5,
                    height: 1.5,
                    color: NlrColors.slate600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 13, 16, 13),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Icon(icon, size: 18, color: NlrColors.slate400),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontSize: 13.5, color: NlrColors.navy),
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              color: NlrColors.slate500,
              fontFeatures: NlrTheme.tabularFigures,
            ),
          ),
        ],
      ),
    );
  }
}
