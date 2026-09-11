import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nlr_authenticator/screens/devices_screen.dart';
import 'package:nlr_authenticator/screens/home_screen.dart';
import 'package:nlr_authenticator/screens/otp_screen.dart';
import 'package:nlr_authenticator/screens/scan_qr_screen.dart';
import 'package:nlr_authenticator/screens/settings_screen.dart';
import 'package:nlr_authenticator/screens/splash_screen.dart';

/// Route table.
///
/// Flat and small on purpose - five screens and one parameterised detail route.
/// A shell route with nested navigators would be machinery this app has no use
/// for.
abstract final class AppRoutes {
  static const splash = '/';
  static const home = '/home';
  static const scan = '/scan';
  static const devices = '/devices';
  static const settings = '/settings';

  /// `/otp/:id`. Built through [otpFor] so the path is written once.
  static String otpFor(String identityId) => '/otp/$identityId';
}

final GoRouter appRouter = GoRouter(
  initialLocation: AppRoutes.splash,
  routes: [
    GoRoute(
      path: AppRoutes.splash,
      builder: (context, state) => const SplashScreen(),
    ),
    GoRoute(
      path: AppRoutes.home,
      builder: (context, state) => const HomeScreen(),
    ),
    GoRoute(
      path: AppRoutes.scan,
      builder: (context, state) => const ScanQrScreen(),
    ),
    GoRoute(
      path: AppRoutes.devices,
      builder: (context, state) => const DevicesScreen(),
    ),
    GoRoute(
      path: AppRoutes.settings,
      builder: (context, state) => const SettingsScreen(),
    ),
    GoRoute(
      path: '/otp/:id',
      builder: (context, state) =>
          OtpScreen(identityId: state.pathParameters['id'] ?? ''),
    ),
  ],

  // A deep link to a route that no longer exists should land somewhere useful,
  // not on a red screen.
  errorBuilder: (context, state) => Scaffold(
    appBar: AppBar(title: const Text('Not found')),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('That screen does not exist.'),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () => context.go(AppRoutes.home),
              child: const Text('Back to codes'),
            ),
          ],
        ),
      ),
    ),
  ),
);
