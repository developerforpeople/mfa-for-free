import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/state/identity_store.dart';

/// First screen. Loads local state, then moves on to Home.
///
/// There is real work behind this: reading the device record, loading the
/// identities, and asking the Keystore for the AES key so the codes can be
/// derived. A brief minimum display time stops the screen flashing past on a
/// fast device, which reads as a glitch rather than as a launch.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    // Deferred to after the first frame: navigating or touching an inherited
    // widget during initState happens before the tree is ready.
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final store = context.read<IdentityStore>();

    final results = await Future.wait([
      store.initialise(),
      Future<void>.delayed(const Duration(milliseconds: 700)),
    ]);

    // Guards against the widget being disposed mid-load, which turns a
    // navigation call into a crash.
    if (!mounted) return;
    if (results.isEmpty) return;

    context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: NlrColors.navy,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const _ShieldMark(),
            const SizedBox(height: NlrSpacing.lg),

            const Text(
              'NLR Identity',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 13,
                letterSpacing: 1.6,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 6),

            const Text(
              'NLR Authenticator',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: NlrSpacing.xl),

            const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(Colors.white54),
              ),
            ),
            const SizedBox(height: NlrSpacing.md),

            const Text(
              'Loading',
              style: TextStyle(color: Colors.white38, fontSize: 12.5),
            ),
          ],
        ),
      ),
    );
  }
}

/// The shield mark, drawn rather than shipped as an image.
///
/// Vector at any density, themeable, and no asset pipeline for one small logo.
class _ShieldMark extends StatelessWidget {
  const _ShieldMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
      ),
      child: const Icon(
        Icons.shield_outlined,
        color: NlrColors.accent,
        size: 32,
      ),
    );
  }
}
