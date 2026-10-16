# Stick-Abuse-Limited 2.2.11

## Added
- Immediate curve staging: dragging points, selecting presets and changing smoothing now update the working profile immediately. Use Write to controller to apply the staged changes.
- Guided linearity bench in Labs, with center stability, repeated center-to-rim passes, tremor and observed output-step analysis.
- Kernel USB polling test in Labs: an eight-second Windows USB trace with completion-rate distribution and stall analysis. Administrator approval is required per capture. Leaving or hiding Labs cancels collection.
- LeadJoy Saber Plus workspace for button remapping, stick curves, ranges and gates, mouse output and trigger ranges, with Main/Sub1/Sub2 editing and verified writes.

## Fixed
- Quit now waits for a background RC read instead of repeatedly rejecting the close request. The required RC warning and reset choice remain in place.
- Write to controller no longer rejects a click just because a background RC check is reading the controller. The request waits for that check and writes once.
- Controller writes remain blocked during conflicting operations and active Labs measurements.

## Testing and limits
Type checks, production build and regression tests passed, including protocol fixtures, write preservation, background-read contention and Labs cancellation. Physical LeadJoy validation and elevated USB capture validation are still pending. USB completion rate is not input latency, and the linearity bench measures the observed movement rather than proving sensor resolution. LeadJoy sub-profile activation is not exposed.

This release replaces 2.2.10, which had a quit-lock issue.

## Downloads
- Setup: installs the app and uses this repository for automatic updates.
- Portable: runs without installation.
