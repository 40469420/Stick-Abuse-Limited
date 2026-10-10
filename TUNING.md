# Trigger, gyro and calibration controls

These pages currently require an identified G7 Pro 8K (`G7ProCE`). Profile settings are staged until **Write to controller**. Calibration commands operate immediately and are separate from profile writes and center offsets.

## Triggers

LT and RT have independent input/output windows in 0.1% increments, adaptive or fixed hair triggers, and custom response curves with three editable interior points and fixed endpoints. Neutral tuning restores the tuning fields while preserving keybindings and turbo. The live percentage is mapped controller output, not a raw physical travel measurement. The curve graph previews the stored custom points; firmware preset curves may differ until a custom point is edited.

Verified 32-byte trigger fields: deadzone enable at 2, four big-endian ranges at 3–10; hair trigger status at 16 (enable bit 7 and mode bits 0–1), start/end at 17–18; curve enable/type/curvature at 19–21 and five point pairs at 22–31. Reserved bits survive hair-trigger edits. Invalid windows or curves are rejected before any mutation.

## Gyro

Aim and Tilt have separate activation combinations, yaw/roll selection, inversion, ranges, custom curves, output mappings and sensitivities. Enabling one turns the other off while retaining its settings, matching Connect. Precision/high-speed sensor mode applies to both. Directional output supports five key assignments. Keyboard/mouse output depends on firmware and connection mode. No raw angular sensor data is assumed or displayed.

Verified 41-byte motion fields: activation at 0, three activation keys at 1–3, orientation at 4, deadzone enable at 5, four ranges at 6–13, curve at 14–26, map enable at 27, inversion flags at 28–30, axis balance at 31, mouse sensitivity at 32, output at 33, directional keys at 35–39, stick sensitivity at 40. Byte 34 is preserved without exposing an unverified control. The old unused motion accessors incorrectly overlapped activation keys and deadzone flags; these have been corrected.

## Calibration workflows

All five workflows found in Connect 1.16.7's G7 Pro CE handler are included:

- Sticks and triggers together (mask 15).
- Sticks only (mask 3).
- Triggers only (mask 12).
- Motion sensor (mask 16), with automatic completion reported by firmware.
- Fine stick tuning (mask 3, mode 1), guiding both sticks through up, down, left, right and circles.

Standard command: `0F FE state mask 00`; fine tuning: `0F FE state 03 01`. State 0 starts, 1 saves, and 2 cancels. Fine mode sends a 500 ms heartbeat. Input bytes 31/32 carry status: standard idle mode is 1 and the status bits identify passed parts. Fine mode target 3 reports steps 0–4 and 128 (ready); terminal confirmation is 0/0. Selection 19 in the app bridge is only a local identifier for fine tuning and is never sent as a firmware mask.

Profile operations, macros, center adjustment and RC measurements are blocked during a calibration session. Manual save requires the firmware's ready state, then waits up to three seconds for a fresh terminal report. A timeout or disconnect reports an unknown result, not a successful save. Leaving the page requests cancellation. Sessions time out after two minutes. Calibration is not blocked by mapped stick drift, since correcting drift is a reason to calibrate.

Protocol metadata was independently documented from the locally installed Connect 1.16.7 bundle; no vendor implementation was copied into the project. Byte-level and simulated-controller tests cover isolation, invalid input, progress gating, all five workflows and terminal confirmation. Actual firmware behavior and ergonomics still need user verification on hardware. No calibration commands were sent to a real controller during development.

## Linear stick preset correction

The former “Pure raw 1:1” action incorrectly cleared stick enable (byte 0, bit 0). Connect’s raw-mode writer keeps stick enable set and selects square/raw shape using byte 1. The replacement “Linear full range (1:1)” keeps the stick enabled, selects square shape, sets input/output windows to 0–100%, selects a linear curve, and restores equal axis balance. Mapping, inversion and unrelated flags are preserved. This corrects the configuration error; the reported sensitivity effect still needs hardware confirmation.
