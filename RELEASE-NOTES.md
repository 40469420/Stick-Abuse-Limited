# Stick Labs (Unlimited) 2.1.0

The Unlimited fork expands Stick Labs with controller customization, trigger and gyro tuning, and guided calibration for the GameSir G7 Pro 8K.

## Installation and updates

Download **Stick-Labs-Unlimited-setup-2.1.0.exe** and run the installer. This release contains the setup installer and updater metadata only; no portable is included. Installed copies check `40469420/stick-labs-unlimited` for updates, download available updates and offer to restart. Automatic updates between two released Unlimited versions still need end-to-end verification. Original project attribution is retained.

## Additions

- **RC filters:** independent negative and positive levels for both sticks, copy/reset controls, a warning acknowledgment gate, baseline/comparison measurements and optional XInput capture with explicit slot selection. Captures retain full vendor reports before display throttling.
- **Background RC reset:** an optional Reset RC On Disconnect/Reconnect setting. The app closes to the system tray and can monitor reconnections. Actual quitting with RC enabled always offers a reset; closing to tray stays silent. Reset writes are verified, and failures keep the app open when reset was requested.
- **Center offsets:** directional nudges and mouse adjustment with an original-axis center preview. These are immediate global changes, separate from profile edits and calibration.
- **Keybindings:** original/unbound behavior, up to three output slots, controller/keyboard/mouse outputs, toggle and turbo controls. Available outputs depend on firmware and connection mode.
- **Macros:** editable timing, inserting, reordering, duplicating and deleting steps, reusable JSON import/export, copying between function keys, and a timeline preview. Recording supports focused keyboard input and original controller-button reports; playback uses the controller's stored macro feature, not desktop input injection. Recording is sequential and limited to 32 steps / 30 seconds.
- **Trigger tuning:** independent LT/RT input and output ranges, adaptive/fixed hair triggers and custom response curves.
- **Gyro tuning:** Aim/Tilt activation combinations, orientation, mapping, inversion, axis balance, sensitivity, precision/high-speed mode, ranges and curves.
- **Calibration:** all five workflows found in Connect's G7 Pro 8K path: sticks and triggers together, sticks only, triggers only, motion sensor, and fine stick tuning. Fine tuning follows directional/circle stages and requires the controller's ready-to-save state. Save completion is checked against a fresh controller status report.

## Fixes and improvements

- Replaced the faulty Pure Raw 1:1 action, which disabled stick processing, with **Linear full range (1:1)**. It keeps the stick enabled and configures neutral ranges and linear response. Select it and Write to controller to correct an older stored setting.
- Corrected motion activation-key and orientation offsets to avoid overlapping unrelated fields.
- Removed redundant Left/Right stick selectors from pages that do not use them.
- Added byte-preservation, input validation, capture, macro and simulated controller lifecycle tests, updated documentation and setup-only release automation.

## Testing and limitations

Type checks and automated tests pass. Tests use synthetic reports and fake controllers; they do not establish physical behavior on every firmware. RC filtering effects, expanded mappings, gyro behavior and calibration results still require hardware verification. The raw-linear configuration error is corrected, but the reported sensitivity effect needs a physical retest.

Center offsets and calibration act immediately; other profile changes require **Write to controller**. Close GameSir Connect before connecting. Writing an active profile can temporarily disconnect the controller.

No custom firmware or vendor software is included. Raw stored resolution values do not prove physical sensor bit depth. RC filters, macros and automated actions may violate game rules; this release does not promise permission or protection from bans.
