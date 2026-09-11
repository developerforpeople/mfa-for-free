import 'package:flutter/material.dart';

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/models/identity.dart';

/// A compact identity row, without a code.
///
/// Used on the devices screen, where the subject is the enrolment itself rather
/// than the code it produces. Deliberately does not display a code: showing one
/// in a management list means a shoulder-surfer gets it from a screen the user
/// is not treating as sensitive.
class IdentityTile extends StatelessWidget {
  const IdentityTile({
    super.key,
    required this.identity,
    this.onRemove,
    this.trailing,
  });

  final Identity identity;
  final VoidCallback? onRemove;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: NlrColors.accentSoft,
          borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
        ),
        alignment: Alignment.center,
        child: Text(
          _initials(identity.displayName),
          style: const TextStyle(
            color: NlrColors.accent,
            fontWeight: FontWeight.w600,
            fontSize: 13.5,
          ),
        ),
      ),
      title: Text(
        identity.displayName,
        style: Theme.of(context).textTheme.titleMedium,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 2),
          Text(
            identity.email,
            style: const TextStyle(fontSize: 13, color: NlrColors.slate500),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 3),
          Text(
            '${identity.deviceName} · enrolled ${_formatDate(identity.createdDate)}',
            style: const TextStyle(fontSize: 11.5, color: NlrColors.slate400),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
      trailing:
          trailing ??
          (onRemove == null
              ? null
              : IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.delete_outline, size: 20),
                  color: NlrColors.slate400,
                  tooltip: 'Remove ${identity.displayName}',
                )),
    );
  }

  static String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'[\s@._-]+'))
        .where((p) => p.isNotEmpty)
        .toList();

    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }

  static String _formatDate(DateTime date) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${date.day} ${months[date.month - 1]} ${date.year}';
  }
}
