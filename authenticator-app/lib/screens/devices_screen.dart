import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/models/identity.dart';
import 'package:nlr_authenticator/state/identity_store.dart';
import 'package:nlr_authenticator/widgets/identity_tile.dart';

/// This device, and every identity enrolled on it.
///
/// Note the framing: identities belong to a *device*. That is the idea the
/// screen is here to make visible - a second factor is "something you have", and
/// the thing you have is this phone. Two phones enrolled against one account are
/// two independent devices, each with its own secret, each revocable alone.
class DevicesScreen extends StatelessWidget {
  const DevicesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<IdentityStore>();
    final device = store.device;
    final identities = store.identities;

    return Scaffold(
      appBar: AppBar(title: const Text('Devices')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
        children: [
          if (device != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: NlrColors.accentSoft,
                            borderRadius: BorderRadius.circular(
                              NlrSpacing.radiusSmall,
                            ),
                          ),
                          child: const Icon(
                            Icons.smartphone,
                            size: 20,
                            color: NlrColors.accent,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      device.name,
                                      style: Theme.of(
                                        context,
                                      ).textTheme.titleMedium,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 7,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFDCFCE7),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text(
                                      'This device',
                                      style: TextStyle(
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.w600,
                                        color: NlrColors.success,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                device.summary(identities),
                                style: const TextStyle(
                                  fontSize: 12.5,
                                  color: NlrColors.slate500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () => _rename(context, store),
                          icon: const Icon(Icons.edit_outlined, size: 19),
                          color: NlrColors.slate400,
                          tooltip: 'Rename device',
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    const Divider(height: 1),
                    const SizedBox(height: 12),
                    _MetaRow(label: 'Device ID', value: device.id),
                    _MetaRow(
                      label: 'Registered',
                      value: _formatDate(device.registeredAt),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],

          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              'ENROLLED IDENTITIES (${identities.length})',
              style: const TextStyle(
                fontSize: 11,
                letterSpacing: 0.9,
                fontWeight: FontWeight.w600,
                color: NlrColors.slate400,
              ),
            ),
          ),

          if (identities.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 30),
                child: Center(
                  child: Column(
                    children: [
                      const Text(
                        'No identities enrolled on this device',
                        style: TextStyle(
                          fontSize: 13.5,
                          color: NlrColors.slate500,
                        ),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () => context.push('/scan'),
                        icon: const Icon(Icons.qr_code_scanner, size: 17),
                        label: const Text('Scan QR code'),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            Card(
              child: Column(
                children: [
                  for (var i = 0; i < identities.length; i++) ...[
                    if (i > 0) const Divider(height: 1, indent: 68),
                    IdentityTile(
                      identity: identities[i],
                      onRemove: () =>
                          _confirmRemoval(context, store, identities[i]),
                    ),
                  ],
                ],
              ),
            ),

          const SizedBox(height: 20),

          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: NlrColors.surface,
              borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
              border: Border.all(color: NlrColors.border),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 17, color: NlrColors.slate400),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Removing an identity here deletes its secret from this '
                    'phone. It does not tell the website - in a complete system '
                    'the server keeps its own list of devices, and revoking '
                    'there is what actually stops a code being accepted.',
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.5,
                      color: NlrColors.slate600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _rename(BuildContext context, IdentityStore store) async {
    final controller = TextEditingController(text: store.device?.name ?? '');

    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Rename device'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(hintText: 'John Phone'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    controller.dispose();

    if (result != null && result.trim().isNotEmpty) {
      await store.renameDevice(result);
    }
  }

  Future<void> _confirmRemoval(
    BuildContext context,
    IdentityStore store,
    Identity identity,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove this identity?'),
        content: Text(
          'This deletes the secret for ${identity.email} from this device. '
          'The app cannot recover it - you would need to scan a new QR code '
          'from the NLR Identity website.',
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

    if (confirmed == true) await store.remove(identity.id);
  }

  static String _formatDate(DateTime value) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(value.day)}/${two(value.month)}/${value.year}';
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: const TextStyle(fontSize: 12.5, color: NlrColors.slate500),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 12.5,
                color: NlrColors.slate600,
                fontFeatures: NlrTheme.tabularFigures,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
