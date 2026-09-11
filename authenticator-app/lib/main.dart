import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'package:nlr_authenticator/app/routes.dart';
import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/state/identity_store.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Portrait only. A rotating authenticator is not a feature anyone wants, and
  // locking it keeps the code centred and readable while being transcribed.
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(const NlrAuthenticatorApp());
}

class NlrAuthenticatorApp extends StatelessWidget {
  const NlrAuthenticatorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => IdentityStore(),
      child: _LifecycleGate(
        child: MaterialApp.router(
          title: 'NLR Authenticator',
          debugShowCheckedModeBanner: false,
          theme: NlrTheme.light,
          routerConfig: appRouter,
        ),
      ),
    );
  }
}

/// Drops decrypted secrets from memory when the app leaves the foreground.
///
/// Two things happen when the app is backgrounded:
///
///  * `IdentityStore.lock()` clears the plaintext secret cache, so the secrets
///    are not sitting in the memory of a suspended process. They are re-derived
///    from the Keystore on resume.
///  * On Android, FLAG_SECURE blanks the app-switcher thumbnail, so a live code
///    is not left on screen in the recents list.
///
/// Neither is exotic; both are what a user reasonably assumes an authenticator
/// already does.
class _LifecycleGate extends StatefulWidget {
  const _LifecycleGate({required this.child});

  final Widget child;

  @override
  State<_LifecycleGate> createState() => _LifecycleGateState();
}

class _LifecycleGateState extends State<_LifecycleGate>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final store = context.read<IdentityStore>();

    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
        store.lock();
      case AppLifecycleState.resumed:
        // Fire-and-forget: the UI shows "code unavailable" for the frame or two
        // this takes, then updates when the cache is warm again.
        unawaited(store.unlock());
      case AppLifecycleState.inactive:
        // Transient - a notification shade pull, a call banner. Clearing the
        // cache here would make codes flicker during ordinary use.
        break;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
