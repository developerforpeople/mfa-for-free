import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Design tokens and the app theme.
///
/// The reference points are Google Authenticator, Microsoft Authenticator and
/// 1Password: dense, quiet, legible at arm's length. A security tool that looks
/// playful is a security tool people trust less, so this file is deliberately
/// restrained - flat surfaces, hairline dividers, small radii, one accent colour
/// used sparingly.
///
/// The palette matches the demo website (`demo-website/src/styles/index.css`) so
/// that the two halves of NLR Identity look like one product.
abstract final class NlrColors {
  /// Deep navy. App bars, headings, the code itself.
  static const navy = Color(0xFF0F172A);
  static const navy800 = Color(0xFF1E293B);

  /// Professional blue. Actions and focus only - never decoration.
  static const accent = Color(0xFF2563EB);
  static const accentSoft = Color(0xFFEFF4FF);

  /// Slate ramp for text and borders.
  static const slate600 = Color(0xFF475569);
  static const slate500 = Color(0xFF64748B);
  static const slate400 = Color(0xFF94A3B8);
  static const border = Color(0xFFE2E8F0);

  /// Light gray page background.
  static const background = Color(0xFFF1F5F9);
  static const surface = Color(0xFFFFFFFF);

  static const success = Color(0xFF15803D);
  static const warning = Color(0xFFB45309);
  static const danger = Color(0xFFB91C1C);

  /// Countdown colour once a code is nearly stale (under 5 seconds left).
  static const expiring = Color(0xFFC2410C);
}

abstract final class NlrSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;

  /// Cards use a 10px radius. Not a pill - large radii read as consumer-app
  /// friendliness, which is the opposite of the tone wanted here.
  static const radius = 10.0;
  static const radiusSmall = 8.0;
}

abstract final class NlrTheme {
  /// Font family.
  ///
  /// The brief asks for Inter. It is intentionally NOT loaded through
  /// `google_fonts`, because that package downloads font files at runtime - and
  /// this app ships without the INTERNET permission precisely so it cannot make
  /// network calls. A font that needs a network is the wrong dependency for an
  /// offline authenticator.
  ///
  /// To use real Inter: drop the TTFs into `assets/fonts/`, declare them in
  /// `pubspec.yaml`, and set this to `'Inter'`. Until then the platform UI font
  /// (Roboto on Android, SF Pro on iOS) is used, which is what the reference
  /// authenticator apps do anyway.
  static const String? fontFamily = null;

  /// Tabular figures keep the six digits from shifting as the code changes.
  /// Without this the number visibly jitters every 30 seconds, which looks
  /// broken even though it is not.
  static const List<FontFeature> tabularFigures = [
    FontFeature.tabularFigures(),
  ];

  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      fontFamily: fontFamily,
      colorScheme: ColorScheme.fromSeed(
        seedColor: NlrColors.accent,
        brightness: Brightness.light,
        primary: NlrColors.accent,
        surface: NlrColors.surface,
      ),
      scaffoldBackgroundColor: NlrColors.background,
    );

    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: NlrColors.surface,
        foregroundColor: NlrColors.navy,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: NlrColors.navy,
          fontSize: 17,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
        systemOverlayStyle: SystemUiOverlayStyle.dark,
      ),

      cardTheme: CardThemeData(
        color: NlrColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NlrSpacing.radius),
          side: const BorderSide(color: NlrColors.border),
        ),
      ),

      dividerTheme: const DividerThemeData(
        color: NlrColors.border,
        thickness: 1,
        space: 1,
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: NlrColors.accent,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: NlrSpacing.lg),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
          ),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: NlrColors.navy,
          minimumSize: const Size(0, 48),
          side: const BorderSide(color: NlrColors.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
          ),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: NlrColors.accent),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: NlrColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
          borderSide: const BorderSide(color: NlrColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
          borderSide: const BorderSide(color: NlrColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
          borderSide: const BorderSide(color: NlrColors.accent, width: 1.5),
        ),
        labelStyle: const TextStyle(color: NlrColors.slate500, fontSize: 14),
      ),

      listTileTheme: const ListTileThemeData(
        iconColor: NlrColors.slate500,
        textColor: NlrColors.navy,
      ),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: NlrColors.navy800,
        contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NlrSpacing.radiusSmall),
        ),
      ),

      textTheme: base.textTheme
          .apply(bodyColor: NlrColors.slate600, displayColor: NlrColors.navy)
          .copyWith(
            titleMedium: const TextStyle(
              color: NlrColors.navy,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.1,
            ),
            bodySmall: const TextStyle(
              color: NlrColors.slate500,
              fontSize: 12.5,
            ),
          ),
    );
  }

  /// The style for a displayed one-time code.
  ///
  /// Wide letter spacing and tabular figures: a six-digit code is read aloud and
  /// typed by hand, so it needs to be unambiguous and to stop moving.
  static const TextStyle codeStyle = TextStyle(
    fontSize: 34,
    fontWeight: FontWeight.w600,
    letterSpacing: 5,
    color: NlrColors.navy,
    fontFeatures: tabularFigures,
    height: 1.1,
  );

  static const TextStyle monoSmall = TextStyle(
    fontSize: 12.5,
    color: NlrColors.slate500,
    fontFeatures: tabularFigures,
  );
}
