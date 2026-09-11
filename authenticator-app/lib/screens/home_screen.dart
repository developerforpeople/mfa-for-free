import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/models/identity.dart';
import 'package:nlr_authenticator/state/identity_store.dart';
import 'package:nlr_authenticator/widgets/otp_card.dart';

/// The main screen: every enrolled identity and its current code.
///
/// Rebuilds once a second from the store's ticker, which is what keeps the
/// countdown rings and the codes truthful.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<IdentityStore>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('NLR Authenticator'),
        actions: [
          IconButton(
            onPressed: () => context.push('/devices'),
            icon: const Icon(Icons.devices_outlined, size: 22),
            tooltip: 'Devices',
          ),
          IconButton(
            onPressed: () => context.push('/settings'),
            icon: const Icon(Icons.settings_outlined, size: 22),
            tooltip: 'Settings',
          ),
          const SizedBox(width: 4),
        ],
      ),

      body: switch (store) {
        IdentityStore(isLoading: true) => const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        IdentityStore(error: final String message) => _ErrorState(
          message: message,
        ),
        IdentityStore(isEmpty: true) => const _EmptyState(),
        _ => _IdentityList(store: store),
      },

      floatingActionButton: store.isLoading
          ? null
          : FloatingActionButton.extended(
              onPressed: () => context.push('/scan'),
              backgroundColor: NlrColors.accent,
              foregroundColor: Colors.white,
              elevation: 2,
              icon: const Icon(Icons.add, size: 20),
              label: const Text(
                'Add identity',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
    );
  }
}

class _IdentityList extends StatelessWidget {
  const _IdentityList({required this.store});

  final IdentityStore store;

  @override
  Widget build(BuildContext context) {
    final identities = store.identities;

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      itemCount: identities.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final identity = identities[index];

        return OtpCard(
          identity: identity,
          code: store.codeFor(identity),
          error: store.decryptionErrorFor(identity),
          onTap: () => context.push('/otp/${identity.id}'),
          onRemove: () => _showOptions(context, store, identity),
        );
      },
    );
  }

  void _showOptions(
    BuildContext context,
    IdentityStore store,
    Identity identity,
  ) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: NlrColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      identity.displayName,
                      style: Theme.of(sheetContext).textTheme.titleMedium,
                    ),
                    Text(
                      identity.email,
                      style: const TextStyle(
                        fontSize: 13,
                        color: NlrColors.slate500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.open_in_full, size: 20),
              title: const Text('Show full screen'),
              onTap: () {
                Navigator.pop(sheetContext);
                context.push('/otp/${identity.id}');
              },
            ),
            ListTile(
              leading: const Icon(
                Icons.delete_outline,
                size: 20,
                color: NlrColors.danger,
              ),
              title: const Text(
                'Remove identity',
                style: TextStyle(color: NlrColors.danger),
              ),
              onTap: () async {
                Navigator.pop(sheetContext);
                final confirmed = await _confirmRemoval(context, identity);
                if (confirmed) await store.remove(identity.id);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  /// Removal is irreversible, so it asks - and says exactly what is lost.
  ///
  /// Vague confirmations ("Are you sure?") train people to tap Yes. Naming the
  /// consequence is what makes the dialog worth showing.
  Future<bool> _confirmRemoval(BuildContext context, Identity identity) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove this identity?'),
        content: Text(
          'This deletes the secret for ${identity.email} from this device. '
          'You will stop being able to generate codes for it, and this app '
          'cannot get the secret back.\n\n'
          'To use it again you would scan a new QR code from the NLR Identity '
          'website.',
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

    return result ?? false;
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: NlrColors.accentSoft,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(
                Icons.qr_code_scanner,
                color: NlrColors.accent,
                size: 26,
              ),
            ),
            const SizedBox(height: NlrSpacing.lg),
            Text(
              'No identities yet',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w600,
                color: NlrColors.navy,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Sign in on the NLR Identity website, open Set up MFA, and scan '
              'the QR code it shows you.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                height: 1.5,
                color: NlrColors.slate500,
              ),
            ),
            const SizedBox(height: NlrSpacing.lg),
            FilledButton.icon(
              onPressed: () => context.push('/scan'),
              icon: const Icon(Icons.qr_code_scanner, size: 18),
              label: const Text('Scan QR code'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: NlrColors.danger, size: 32),
            const SizedBox(height: NlrSpacing.md),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, height: 1.5),
            ),
            const SizedBox(height: NlrSpacing.lg),
            OutlinedButton(
              onPressed: () => context.read<IdentityStore>().initialise(),
              child: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
