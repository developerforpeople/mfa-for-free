import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/services/qr_service.dart';
import 'package:nlr_authenticator/state/identity_store.dart';

/// Enrollment by QR scan.
///
/// This is the only moment a secret enters the app, and the only moment the
/// camera is used. The flow is:
///
///   scan -> parse -> confirm -> encrypt -> store
///
/// The secret is held in memory between parse and encrypt, and nowhere else. It
/// is never written to a log, never shown in full after this screen, and never
/// sent anywhere - there is nowhere to send it to.
class ScanQrScreen extends StatefulWidget {
  const ScanQrScreen({super.key});

  @override
  State<ScanQrScreen> createState() => _ScanQrScreenState();
}

class _ScanQrScreenState extends State<ScanQrScreen> {
  late final MobileScannerController _controller;

  /// Set while a detection is being handled.
  ///
  /// The camera fires detections continuously - several per second on a code it
  /// can see clearly. Without this latch the user gets a stack of duplicate
  /// enrollment sheets from one QR code.
  bool _handling = false;

  String? _inlineError;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      // Only QR. Restricting the formats means the detector is not also looking
      // for barcodes on cereal boxes, which is faster and avoids odd matches.
      formats: const [BarcodeFormat.qrCode],
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing: CameraFacing.back,
    );
  }

  @override
  void dispose() {
    // The controller was created here, so it is disposed here. Leaving it alive
    // holds the camera open after the screen is gone.
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_handling) return;

    final raw = capture.barcodes
        .map((barcode) => barcode.rawValue)
        .firstWhere(
          (value) => value != null && value.isNotEmpty,
          orElse: () => null,
        );

    if (raw == null) return;

    // A camera pointed at the world sees plenty of QR codes that are not
    // enrollments. Those are ignored silently rather than flashing an error -
    // an error per Wi-Fi code or URL would make the screen unusable.
    if (!QrService.looksLikeEnrollment(raw)) return;

    setState(() => _handling = true);
    await _handlePayload(raw);
  }

  Future<void> _handlePayload(String raw) async {
    final store = context.read<IdentityStore>();

    try {
      final payload = QrService.parse(raw);

      // Already enrolled? Offer to replace rather than refusing.
      //
      // Refusing was a trap. Re-generating the QR on the website issues a NEW
      // secret and discards the old one, so a user who scans again is holding a
      // dead enrolment - one that keeps producing six-digit codes that look
      // perfectly valid and are rejected every time, with nothing on screen to
      // explain why. Replacing is what the user meant by scanning.
      var replaceExisting = false;

      if (store.isAlreadyEnrolled(payload.accountName)) {
        if (!mounted) return;
        final shouldReplace = await _confirmReplace(payload.accountName);

        if (shouldReplace != true) {
          setState(() => _handling = false);
          return;
        }
        replaceExisting = true;
      }

      if (!mounted) return;
      final confirmed = await _confirmEnrollment(
        payload,
        replaceExisting: replaceExisting,
      );

      if (confirmed != true) {
        // Back to scanning rather than leaving the screen dead.
        setState(() => _handling = false);
        return;
      }

      if (!mounted) return;
      context.pop();
    } on QrParseException catch (error) {
      _showError(error.message);
    } catch (error) {
      _showError('Could not read that code. ($error)');
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    setState(() {
      _inlineError = message;
      _handling = false;
    });
  }

  /// Confirmation step before anything is stored.
  ///
  /// Enrolling silently on detection would be faster, and wrong: a QR code can
  /// be swapped, printed on a poster, or pointed at by accident. Showing the
  /// account and asking is what makes the user a participant in the decision.
  Future<bool?> _confirmEnrollment(
    EnrollmentPayload payload, {
    bool replaceExisting = false,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: NlrColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (sheetContext) =>
          _EnrollmentSheet(payload: payload, replaceExisting: replaceExisting),
    );
  }

  /// Asks before discarding an existing enrolment for the same identity.
  Future<bool?> _confirmReplace(String accountName) {
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Replace this identity?'),
        content: Text(
          '$accountName is already on this device.\n\n'
          'Scanning a new QR code means the website has issued a new secret, '
          'and the old one no longer works. Replacing keeps this device in '
          'step with your account.\n\n'
          'The existing entry will be removed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Replace'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text(
          'Scan NLR Identity QR',
          style: TextStyle(color: Colors.white),
        ),
        actions: [
          IconButton(
            onPressed: () => _controller.toggleTorch(),
            icon: const Icon(Icons.flashlight_on_outlined),
            tooltip: 'Torch',
          ),
          IconButton(
            onPressed: () => _controller.switchCamera(),
            icon: const Icon(Icons.cameraswitch_outlined),
            tooltip: 'Switch camera',
          ),
        ],
      ),

      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) => _onDetect(capture),
            errorBuilder: (context, error) => _CameraError(error: error),
          ),

          const _ViewfinderOverlay(),

          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _ScanFooter(
              error: _inlineError,
              onManualEntry: _openManualEntry,
              onDismissError: () => setState(() => _inlineError = null),
            ),
          ),
        ],
      ),
    );
  }

  /// Manual entry, for a device with no camera or a QR that will not scan.
  ///
  /// Accepts either a full `otpauth://` URI or a bare Base32 setup key. Both are
  /// offered on the NLR Identity website, and a user who cannot scan needs one
  /// of them to work.
  Future<void> _openManualEntry() async {
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => const _ManualEntryDialog(),
    );

    if (result == null || result.trim().isEmpty) return;
    if (!mounted) return;

    final text = result.trim();

    // A bare setup key is wrapped into a URI so there is exactly one parsing
    // path, rather than two subtly different ones to keep in step.
    final raw = QrService.looksLikeEnrollment(text)
        ? text
        : QrService.build(secret: text, accountName: 'manual@nlr.com');

    setState(() => _handling = true);
    await _handlePayload(raw);
  }
}

/// The enrollment confirmation sheet.
class _EnrollmentSheet extends StatefulWidget {
  const _EnrollmentSheet({required this.payload, this.replaceExisting = false});

  final EnrollmentPayload payload;

  /// Drop any existing enrolment for this identity before saving the new one.
  final bool replaceExisting;

  @override
  State<_EnrollmentSheet> createState() => _EnrollmentSheetState();
}

class _EnrollmentSheetState extends State<_EnrollmentSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _deviceController;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final store = context.read<IdentityStore>();
    _nameController = TextEditingController();
    _deviceController = TextEditingController(
      text: store.device?.name ?? 'This device',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _deviceController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await context.read<IdentityStore>().enrol(
        payload: widget.payload,
        displayName: _nameController.text.trim().isEmpty
            ? null
            : _nameController.text.trim(),
        deviceName: _deviceController.text.trim().isEmpty
            ? null
            : _deviceController.text.trim(),
        replaceExisting: widget.replaceExisting,
      );

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Could not save this identity: $error';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final payload = widget.payload;
    final insets = MediaQuery.viewInsetsOf(context);

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 18, 20, 20 + insets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: NlrColors.accentSoft,
                  borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
                ),
                child: const Icon(
                  Icons.verified_user_outlined,
                  size: 19,
                  color: NlrColors.accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.replaceExisting
                          ? 'Replace this identity?'
                          : 'Add this identity?',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      payload.issuer,
                      style: const TextStyle(
                        fontSize: 13,
                        color: NlrColors.slate500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: NlrSpacing.md),

          _DetailRow(label: 'Identity', value: payload.accountName),
          _DetailRow(label: 'Algorithm', value: payload.algorithm.label),
          _DetailRow(
            label: 'Code',
            value: '${payload.digits} digits, every ${payload.period}s',
          ),

          const SizedBox(height: NlrSpacing.md),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: 'Display name (optional)',
              hintText: _suggestedName(payload.accountName),
            ),
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _deviceController,
            decoration: const InputDecoration(labelText: 'Device name'),
            textCapitalization: TextCapitalization.words,
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: const TextStyle(fontSize: 13, color: NlrColors.danger),
            ),
          ],

          const SizedBox(height: NlrSpacing.md),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: NlrColors.background,
              borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
              border: Border.all(color: NlrColors.border),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.lock_outline, size: 16, color: NlrColors.slate500),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'The secret is encrypted before it is saved, and is never '
                    'shown again after this step.',
                    style: TextStyle(
                      fontSize: 12.5,
                      height: 1.45,
                      color: NlrColors.slate600,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: NlrSpacing.md),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _saving
                      ? null
                      : () => Navigator.pop(context, false),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation(Colors.white),
                          ),
                        )
                      : Text(
                          widget.replaceExisting
                              ? 'Replace identity'
                              : 'Add identity',
                        ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _suggestedName(String account) {
    final local = account.split('@').first;
    if (local.isEmpty) return 'Your name';
    return '${local[0].toUpperCase()}${local.substring(1)}';
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: NlrColors.slate500),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13.5,
                color: NlrColors.navy,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Darkened surround with a clear square cut out of the middle.
class _ViewfinderOverlay extends StatelessWidget {
  const _ViewfinderOverlay();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = constraints.maxWidth * 0.68;

        return Stack(
          alignment: Alignment.center,
          children: [
            // A hole punched with BlendMode.dstOut, rather than four positioned
            // rectangles around the gap. One shape, no seams at the corners.
            ColorFiltered(
              colorFilter: ColorFilter.mode(
                Colors.black.withValues(alpha: 0.62),
                BlendMode.srcOut,
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(
                    decoration: const BoxDecoration(
                      color: Colors.black,
                      backgroundBlendMode: BlendMode.dstOut,
                    ),
                  ),
                  Center(
                    child: Container(
                      width: side,
                      height: side,
                      decoration: BoxDecoration(
                        color: Colors.black,
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            Container(
              width: side,
              height: side,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.85),
                  width: 2,
                ),
              ),
            ),

            Positioned(
              top: constraints.maxHeight / 2 - side / 2 - 52,
              child: const Text(
                'Point the camera at the enrollment QR code',
                style: TextStyle(color: Colors.white70, fontSize: 13.5),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ScanFooter extends StatelessWidget {
  const _ScanFooter({
    required this.error,
    required this.onManualEntry,
    required this.onDismissError,
  });

  final String? error;
  final VoidCallback onManualEntry;
  final VoidCallback onDismissError;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (error != null)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.error_outline,
                      size: 18,
                      color: NlrColors.danger,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        error!,
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.4,
                          color: NlrColors.navy,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: onDismissError,
                      icon: const Icon(Icons.close, size: 16),
                      color: NlrColors.slate400,
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),

            TextButton.icon(
              onPressed: onManualEntry,
              icon: const Icon(Icons.keyboard_alt_outlined, size: 18),
              label: const Text('Enter setup key instead'),
              style: TextButton.styleFrom(
                foregroundColor: Colors.white,
                backgroundColor: Colors.white.withValues(alpha: 0.14),
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 12,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ManualEntryDialog extends StatefulWidget {
  const _ManualEntryDialog();

  @override
  State<_ManualEntryDialog> createState() => _ManualEntryDialogState();
}

class _ManualEntryDialogState extends State<_ManualEntryDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Enter setup key'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Paste the setup key from the website, or the full otpauth:// link.',
            style: TextStyle(fontSize: 13.5, height: 1.45),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _controller,
            autofocus: true,
            maxLines: 3,
            minLines: 1,
            decoration: const InputDecoration(hintText: 'JBSW Y3DP EHPK 3PXP'),
            // Off for both: a secret has no business in the keyboard's learned
            // word list, and autocorrect mangles Base32 into English words.
            autocorrect: false,
            enableSuggestions: false,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _controller.text),
          child: const Text('Continue'),
        ),
      ],
    );
  }
}

/// Shown when the camera cannot start - almost always a denied permission.
class _CameraError extends StatelessWidget {
  const _CameraError({required this.error});

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final isPermission =
        error.errorCode == MobileScannerErrorCode.permissionDenied;

    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 36),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isPermission
                    ? Icons.no_photography_outlined
                    : Icons.error_outline,
                color: Colors.white70,
                size: 34,
              ),
              const SizedBox(height: NlrSpacing.md),
              Text(
                isPermission
                    ? 'Camera permission is off'
                    : 'The camera could not start',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                isPermission
                    ? 'Allow camera access in Settings to scan a QR code, or '
                          'use "Enter setup key instead" below.'
                    : error.errorDetails?.message ??
                          'Try again, or enter the setup key by hand.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white60,
                  fontSize: 13.5,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
