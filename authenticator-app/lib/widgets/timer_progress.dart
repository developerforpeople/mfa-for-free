import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart' show Ticker;

import 'package:nlr_authenticator/app/theme.dart';
import 'package:nlr_authenticator/services/totp_service.dart';

/// Circular countdown for the current time step.
///
/// Self-animating: it drives itself from a `Ticker` and reads the wall clock on
/// every frame rather than counting down from a start value. That difference
/// matters. A ring that counts its own frames drifts away from the real time
/// step, and worse, it is wrong after the app has been suspended - the user
/// would see a full ring over a code that expired minutes ago.
///
/// Reading the clock each frame means the ring is always correct, including on
/// the frame immediately after resume.
class TimerProgress extends StatefulWidget {
  const TimerProgress({
    super.key,
    this.period = TotpService.defaultPeriod,
    this.size = 34,
    this.strokeWidth = 2.5,
    this.showSeconds = true,
  });

  final int period;
  final double size;
  final double strokeWidth;

  /// Whether to print the remaining seconds inside the ring.
  final bool showSeconds;

  @override
  State<TimerProgress> createState() => _TimerProgressState();
}

class _TimerProgressState extends State<TimerProgress>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;

  @override
  void initState() {
    super.initState();
    // A Ticker rather than a Timer: it is bound to the vsync of this widget, so
    // it stops when the widget is off-screen and does not burn battery drawing
    // frames nobody sees.
    _ticker = createTicker((_) => setState(() {}))..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final progress = TotpService.progress(period: widget.period);
    final remaining = TotpService.secondsRemaining(period: widget.period);

    // The last few seconds turn amber. A colour change is a far better signal
    // than a number for "do not start typing this one".
    final isExpiring = remaining <= 5;
    final colour = isExpiring ? NlrColors.expiring : NlrColors.accent;

    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Semantics(
        label: 'Code expires in $remaining seconds',
        child: CustomPaint(
          painter: _RingPainter(
            progress: progress,
            colour: colour,
            trackColour: NlrColors.border,
            strokeWidth: widget.strokeWidth,
          ),
          child: widget.showSeconds
              ? Center(
                  child: Text(
                    '$remaining',
                    style: TextStyle(
                      fontSize: widget.size * 0.33,
                      fontWeight: FontWeight.w600,
                      color: colour,
                      fontFeatures: NlrTheme.tabularFigures,
                    ),
                  ),
                )
              : null,
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({
    required this.progress,
    required this.colour,
    required this.trackColour,
    required this.strokeWidth,
  });

  final double progress;
  final Color colour;
  final Color trackColour;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;

    final track = Paint()
      ..color = trackColour
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    final arc = Paint()
      ..color = colour
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(centre, radius, track);

    // Starts at twelve o'clock and empties clockwise - the direction people
    // read a depleting timer.
    canvas.drawArc(
      Rect.fromCircle(center: centre, radius: radius),
      -math.pi / 2,
      -2 * math.pi * progress.clamp(0.0, 1.0),
      false,
      arc,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.progress != progress || old.colour != colour;
}

/// Thin linear variant, for the detail screen where the ring would be redundant.
class LinearTimerProgress extends StatefulWidget {
  const LinearTimerProgress({
    super.key,
    this.period = TotpService.defaultPeriod,
  });

  final int period;

  @override
  State<LinearTimerProgress> createState() => _LinearTimerProgressState();
}

class _LinearTimerProgressState extends State<LinearTimerProgress>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((_) => setState(() {}))..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final progress = TotpService.progress(period: widget.period);
    final remaining = TotpService.secondsRemaining(period: widget.period);
    final colour = remaining <= 5 ? NlrColors.expiring : NlrColors.accent;

    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: LinearProgressIndicator(
        value: progress.clamp(0.0, 1.0),
        minHeight: 4,
        backgroundColor: NlrColors.border,
        valueColor: AlwaysStoppedAnimation(colour),
      ),
    );
  }
}
