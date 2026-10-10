# Custom controls and background RC handling

## Tray and RC reset

Closing the main window hides it to the system tray. Double-click the tray icon or select Open Stick Labs to restore it. Quit Stick Labs performs a mandatory RC check independently of the automatic-reset preference. The app uses a single-instance lock so launching the portable again opens the existing window.

The RC page contains **Reset RC On Disconnect/Reconnect**, off by default and saved in the app's user-data directory. Enabling arms the next connection; it does not change the currently connected profile immediately. Select/connect the controller once after starting the app. Background reconnect monitoring continues while the app is running, including in the tray. The app does not install a startup service.

The reset reads the active profile and changes only bytes 49/50 to neutral wire 11. Other profile bytes and other slots remain intact. Factory wire 0 and explicit neutral wire 11 both skip EEPROM writing. Writes use the existing read-back/rollback verification. Only identified G7ProCE/G7ProS layouts are supported. Failures are shown in the RC status and tray tooltip; they are never reported as successful resets.

A disconnected controller cannot receive a write. USB reconnection or an idle-receiver-to-live-pad transition triggers the deferred reset. Reopening after a profile write also triggers a check: RC settings may not survive applying a profile while this option is enabled. Reconnect targets the prior interface, or a unique candidate of the same identified model if its path changed. Ambiguous candidates require manual connection.

Quit shows the always-on yellow/black caution panel when the active profile contains non-neutral RC values, or when their state cannot be established. It reads controller settings rather than unsaved editor values. **Yes** attempts a verified reset before quitting; failure leaves the app open. **No** quits without resetting. Neutral settings allow immediate quit. Closing to the tray never displays this prompt. Pending controller operations must finish before quit checking. This cannot guarantee neutral settings before another program reads the controller, or after forced process termination or power loss.

## Keybindings and macros

The first implementation is gated to identified G7ProCE controllers. Keybindings expose standard buttons, four function buttons and triggers, three output slots, explicit unbinding, toggle and turbo. Trigger mapping uses its own offsets and preserves deadzone/quick-trigger fields. The catalog covers controller buttons/directions, keyboard/numpad, mouse, media and function outputs. Unknown stored codes stay visible and are retained until edited.

Macros use the 169-byte function-button packet: flags at byte 7, big-endian loop delay at 8–9, count at 10, and 32 steps. Steps 1–31 hold five bytes; step 32 has only key/hold, with no trailing delay. Timings are 16-bit milliseconds. Validation rejects overflow, fractional/negative times, excess steps, and changes that would silently discard the final delay. Editing retains unrelated header flag bits. Enabling a macro explicitly clears the function button's normal mapping/turbo/toggle; rebinding disables its macro while retaining its steps.

The editor supports inserting, deleting, reordering, duplicating, bulk timing edits, copying to another function button, and versioned JSON import/export. Import is validated before any packet mutation. Changes remain staged until Write to controller.

Controller recording reads original button states from every vendor report before display throttling, without enabling firmware recording mode. Keyboard recording uses only the focused editor area and never hooks other applications. Recording is limited to 30 seconds/32 steps and rejects overlapping holds because the hardware format is sequential. Disconnects, stale input, unsupported keys and invalid timing discard the recording, retaining the prior macro. The timeline preview sends no input. Actual controller playback occurs from the assigned physical button after writing its profile.

## Evidence and limitations

The installed GameSir Connect 1.16.7 G7ProCE path was inspected locally. Its `Im` catalog, `Hn`/`ri` codec, `di`/`pi` byte layout and `Ei` original-state decoder establish the mapping values, macro flags, timing encoding and original report bits used here. No proprietary source or firmware is included in the app.

Connect's mode definitions disable keyboard/mouse, multi-output mapping and turbo for some variants. Exposing stored fields does not override firmware restrictions or prove output support. Macro playback and these expanded outputs still need physical verification on the user's controller; development tests do not send controller writes. No claim is made that automated gameplay is permitted by a game or ban-safe.

Automated checks cover byte isolation, all catalog codes' uniqueness, keyboard-code anchors, trigger preservation, all 32 macro slots, atomic validation and recording. Main-process tests use fake Electron/controller objects to cover persistent preference, silent tray close, USB/receiver reconnect, neutral-write skipping, mandatory quit warning, Yes/No, and failed reset behavior. Browser UI checks use a simulated controller.

## Remaining Connect areas

Stick Labs is not yet a complete Connect replacement. Trigger tuning, gyro controls and all five G7 Pro 8K calibration workflows are now included; see TUNING.md. Remaining areas include expanded vibration and headset/microphone controls, detailed lighting/dock settings, wake/standby options and firmware updates. Feature availability varies by controller mode/variant.
