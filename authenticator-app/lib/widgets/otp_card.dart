import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/models/identity.dart';
import 'package:nlr_authenticator/services/totp_service.dart';
import 'package:nlr_authenticator/widgets/timer_progress.dart';

/// One identity and its live code.
///
/// Presentational: it is handed a code and renders it. The card does not know
/// where the code came from, does not decrypt anything, and never stores what it
/// is given. Tapping copies the code to the clipboard.
class OtpCard extends StatelessWidget {
  const OtpCard({
    super.key,
    required this.identity,
    required this.code,
    this.error,
    this.onTap,
    this.onRemove,
  });

  final Identity identity;

  /// The current code, or null when it could not be produced.
  final String? code;

  /// Why there is no code, if there is none.
  final String? error;

  final VoidCallback? onTap;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final hasCode = code != null;

    return Card(
      child: InkWell(
        onTap: hasCode ? (onTap ?? () => _copy(context)) : null,
        borderRadius: BorderRadius.circular(NlrSpacing.radius),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      identity.displayName,
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      identity.email,
                      style: const TextStyle(
                        fontSize: 13,
                        color: NlrColors.slate500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 10),
                    if (hasCode)
                      _CodeText(code: code!, digits: identity.digits)
                    else
                      _CodeUnavailable(message: error),
                  ],
                ),
              ),

              if (hasCode) ...[
                const SizedBox(width: 8),
                TimerProgress(period: identity.period),
              ],

              if (onRemove != null)
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.more_vert, size: 20),
                  tooltip: 'Options for ${identity.displayName}',
                  color: NlrColors.slate400,
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _copy(BuildContext context) {
    final value = code;
    if (value == null) return;

    // The clipboard is a real exposure: other apps can read it, and on older
    // Android the system shows a toast with the contents. It is still the right
    // default - people ask to copy codes - but the code is not written anywhere
    // durable, and it expires in seconds regardless.
    Clipboard.setData(ClipboardData(text: value));

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Code copied for ${identity.email}'),
          duration: const Duration(seconds: 2),
        ),
      );
  }
}

class _CodeText extends StatelessWidget {
  const _CodeText({required this.code, required this.digits});

  final String code;
  final int digits;

  @override
  Widget build(BuildContext context) {
    return Text(
      TotpService.formatForDisplay(code),
      style: NlrTheme.codeStyle.copyWith(
        // An 8-digit code needs to be smaller to fit the same row.
        fontSize: digits > 6 ? 28 : 34,
        letterSpacing: digits > 6 ? 3 : 5,
      ),
      // Screen readers should say "4 8 2 9 3 1", not "four hundred eighty-two
      // thousand nine hundred thirty-one", which is useless for transcription.
      semanticsLabel: code.split('').join(' '),
    );
  }
}

class _CodeUnavailable extends StatelessWidget {
  const _CodeUnavailable({this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.lock_outline, size: 16, color: NlrColors.warning),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            message ?? 'Code unavailable',
            style: const TextStyle(fontSize: 12.5, color: NlrColors.warning),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
