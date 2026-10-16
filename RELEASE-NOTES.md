# Stick Abuse 3.0: The Beating

## Live previews
- Device now brings sticks, trigger travel, button and D-pad highlights, rear buttons, and raw sensor readouts into one controller layout. The outer controller outline is removed.
- Gyro has live stick plots and raw gyro/accelerometer counts from received controller reports, with selectable byte order, axes and plot scale.
- Sticks shows original axes beside a staged deadzone/anti-deadzone illustration. The duplicate Live sticks card is removed.
- Triggers has a live output gauge and a separate staged-range graph with test travel.
- Stale preview values clear when reports stop.

## Controls and layout
- Deadzone and anti-deadzone sliders have exact numeric entry, 0.1% nudges and clearer range limits.
- Each stick shape has its own question-mark explanation.
- Smaller dropdowns, macro selectors, numeric fields and tighter spacing across the interface.

## Your colors
- Theme controls customize backgrounds, cards, inputs, borders, text, accents, status colors and preview markers.
- Color pickers and hex entry, default/blue/forest starting palettes, and saved local preferences.

## Validation and limits
Type checks, production build and regression tests passed. Browser checks covered preview edits, Escape cancellation, stale reports, compact menus, narrow layouts and saved custom colors. A passive check received 751 real controller reports without commands or writes. Physical gyro-axis/rotation and scale validation remain pending; sensor values are raw counts, not calibrated angles. Staged range illustrations are separate from actual reported output and do not model the complete firmware pipeline.

## Downloads
Setup includes automatic updates from this repository. Portable runs without installation.
