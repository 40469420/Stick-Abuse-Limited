# Stick Labs (Unlimited)

A Windows controller companion forked from [Realkiyoshii/stick-labs](https://github.com/Realkiyoshii/stick-labs). This fork lives at [40469420/stick-labs-unlimited](https://github.com/40469420/stick-labs-unlimited).

The expanded controls target the **GameSir G7 Pro 8K**. Other detected models retain their existing support; detecting a controller does not mean every feature is supported.

## Install

Download the setup executable from [GitHub Releases](https://github.com/40469420/stick-labs-unlimited/releases/latest). The installer, application window and tray use **Stick Labs (Unlimited)**. Releases include the installer and updater files. Version 2.2.3 also offers an optional portable executable. Installed copies check this fork for updates, download available versions and offer to restart.

## New in 2.2.3: interface cleanup and bit-depth verification

All sections use consistent headings, spacing and click-to-open question-mark
help. Gyro and triggers group activation, output, range and response controls;
gyro shows destination-specific sensitivity and combination keys when applicable.
Exact stick curve points and reset tools remain available in expandable panels.
Steam exports appear only on Steam, and profile-edit controls are hidden on pages
that do not edit profiles. Required RC/firmware acknowledgements remain visible.

Lab has separate timing, bit-depth and saved-comparison views. Bit-depth verification
compares rest and slow-sweep captures at 12-bit against 13/14/16/20/24-bit experimental
requests, using either vendor original axes or an explicitly selected XInput slot.
It checks the active profile and stored setting before/after captures, rejects
changes to other profile bytes, and uses all samples for output-code evidence.
Results distinguish finer reported output, additional noise, unchanged observed
spacing and inconclusive movement. These are heuristic comparisons, not ADC proofs.

Apply changes only the resolution field of a freshly read active profile using
the existing verified write path. It can reboot the controller. Save/discard edits
first. The original resolution byte is saved locally before writing and can be
restored after reopening the page/app on the same connection/profile. Leaving the
page does **not** restore it automatically. Other settings are read fresh during
restore. Use the explicit read check after reconnect to check stored-setting
retention. If background RC reset changes other profile bytes during a write, the
comparison stops; restart with consistent settings. Exports include context and
evidence. XInput axes are signed 16-bit output fields, not proof of sensor precision
([Microsoft documentation](https://learn.microsoft.com/en-us/windows/win32/api/xinput/ns-xinput-xinput_gamepad)).

## New in 2.2.2: performance bench

The Lab page now separates the edited profile's target polling rate from measured
vendor report delivery and observed XInput state changes. Live vendor timing,
guided 5/10/30-second captures, and read-only command round trips run only while
Lab is visible. Page exit, pause, minimize, tray close, disconnection, renderer
failure, and an expired page lease cancel measurements.

- Median/P95/P99/worst report spacing, jitter, interval histograms, repeated
  axis/trigger values, and motion timelines.
- Original-axis center noise and offsets, range plots with angular coverage and
  radial deviation, release/snapback traces with settling checks, trigger sweeps,
  observed distinct values and smallest steps.
- A separate native Windows XInput reader targets 40,000 queries/s without the
  old 1 ms sleep. It reports achieved query rate, packet-counter changes, per-stick
  vector changes, reader spacing, and API call duration. Identify the correct slot
  explicitly; other devices may appear. This short test can use one CPU core.
- Eight named local captures, compatible-test A/B comparisons, and JSON export
  with firmware, connection, app version and edited-profile target context.

These are host-observed measurements. XInput cached-state changes do not prove
USB bus polling or physical sensor rate. API calls and profile-query round trips
do not measure physical button-to-host/game latency. Distinct values and wire
width do not establish ADC resolution. Instrumented hardware or a separate bus
capture is needed for those claims. Timing and motion captures do not change controller settings. The separate bit-depth workflow changes resolution only when you click Apply.

## New in 2.2.1

- Upstream experimental 13/14/16/20/24-bit quick picks, corrected highlighting, and the existing custom 8–12-bit input. These are raw firmware settings, not proof of increased hardware resolution.
- Read-only Marius board preview and clearer connection-timeout guidance.
- Unlimited's calibration workflows and other additions are preserved; the upstream calibration bench is excluded.
- The merged portable passed the user's local test. See [release notes](RELEASE-NOTES.md).

## Added in 2.2.0

- **Firmware:** G7 Pro 8K controller flashing with original 2.1.0 and 2.2.9 images included, profile backups, firmware validation, update-mode identity checks and live logs.
- **Required acknowledgment:** the Firmware page uses the RC page's caution-tape disclaimer and keeps controls greyed out until **I understand Machi** is clicked. Each flash also requires risk acceptance and a typed version confirmation.
- **Updater fixes:** corrected the Quick Update disconnect handoff and replaced the native worker host to resolve the reproduced stack overflow. A native self-check runs before switching controller mode.

Read [Firmware instructions and recovery limits](FIRMWARE.md) before use. Firmware flashing can destroy a controller; recovery is not guaranteed. GameSir Connect must be installed but fully quit during flashing.

## Added in 2.1.0

- **RC filters:** separate -10 to +10 levels per stick, copy/reset controls, a warning acknowledgment gate, and three-second baseline/comparison captures. Optional XInput capture offers explicit slot selection and distinguishes polls from state changes.
- **Connection handling:** optional RC reset on disconnect/reconnect, close to tray, and a mandatory reset choice when actually quitting with RC enabled. Requested resets must verify before quitting; failures are reported.
- **Center adjustment:** directional nudges and mouse dragging, an original-axis preview, serialized commands and acknowledgment handling.
- **Keybindings:** original/unbound behavior, up to three output keys, controller/keyboard/mouse mappings, toggle and turbo settings.
- **Macros:** exact timings, step insertion/deletion/reordering/duplication, copying between function keys, JSON import/export, timeline preview and sequential keyboard/controller recording. Recording is limited to 32 steps and 30 seconds. Playback uses stored controller macros; available outputs depend on firmware.
- **Triggers:** independent LT/RT input/output windows, adaptive/fixed hair triggers, custom curves and neutral tuning controls.
- **Gyro:** Aim/Tilt activation combinations, yaw/roll orientation, inversion, output mapping, axis balance, sensitivity, precision/high-speed mode, ranges and curves.
- **Calibration:** sticks and triggers together, sticks only, triggers only, motion sensor, and fine stick tuning. Fine tuning guides directional/circle stages; saves require ready status and controller confirmation.

### Fixes

- Corrected **Pure Raw 1:1**, which wrongly disabled stick processing. **Linear full range (1:1)** keeps the stick enabled and applies neutral ranges and linear response. Select it and write to correct an older stored setting.
- Captures collect vendor reports before display throttling; original-axis and XInput measurements retain fractional precision.
- Corrected gyro orientation and activation-key offsets to avoid overwriting unrelated fields.
- Removed redundant Left/Right selectors from unrelated pages.
- Calibration no longer requires already-centered mapped sticks, checks device progress and does not treat a sent save command as proof of success.
- Added controller-operation guards, byte-preservation and simulated lifecycle tests, release checks and updater error handling.

See [release notes](RELEASE-NOTES.md) for details and hardware-validation limits. Automatic updating from 2.1.0 to 2.1.1 was confirmed on the test installation.

## Features

- Stick deadzones, response curves, shape, resolution and polling controls.
- Independent RC filter levels, baseline/comparison captures, optional XInput measurements and reconnect resets.
- Manual center nudges and mouse adjustment.
- Button mappings and editable macros, including focused recording and reusable files.
- Independent trigger ranges, hair triggers and custom response curves.
- Gyro activation, orientation, mapping, sensitivity, ranges and curves.
- Five guided calibration workflows, including fine stick tuning.
- Close to tray and a mandatory RC reset prompt when quitting with RC enabled.

Profile edits are staged until **Write to controller**. Center adjustment and calibration operate immediately. Close GameSir Connect before connecting; it can hold the controller interface. Writing the active profile can temporarily disconnect the controller, and the app attempts to reconnect.

The **Linear full range (1:1)** preset keeps stick processing enabled. It replaces the faulty Pure Raw action that disabled the stick block. Calibration and game sensitivity still apply.

## Development

Install Node.js 22 LTS, then run:

```powershell
npm ci
npm run dev
```

## Checks

```powershell
npm run typecheck
npm test
npm run build
```

The default tests use synthetic data and fake controller/Electron objects. Hardware probes in `tests/` are opt-in; run them only after reviewing their behavior. Passing automated tests does not establish firmware support or physical behavior on every controller.

## Packaging and releases

```powershell
npm run dist -- --publish never
```

The release configuration builds an NSIS installer in `dist/`. Releases publish the setup executable, its blockmap and `latest.yml` update metadata; no portable is included. The installer/updater target is **40469420/stick-labs-unlimited**. Local portable test builds remain available through `npm run dist:portable -- --publish never`.

The GitHub workflow runs for version tags such as `v2.1.0`, checks that the tag matches `package.json`, then runs checks and packaging. A normal source push is not a release. Installed builds contain GitHub updater support; portable copies are separate and should not be relied on for automatic updates. Automatic updates from this fork are enabled in installed builds.

## Feature notes

- [RC filters](RC-FILTERS.md): storage, measurements, warnings and firmware limitations.
- [Center offsets](CENTER-OFFSETS.md): immediate global adjustments and acknowledgment handling.
- [Bindings and macros](CUSTOM-CONTROLS.md): supported outputs, timing and recording limits.
- [Triggers, gyro and calibration](TUNING.md): verified layouts, workflows and validation limits.

Some settings depend on firmware and connection mode. RC filtering effects, expanded outputs and calibration behavior require hardware verification. Raw resolution bytes do not prove physical sensor bit depth. Automated actions may violate a game's rules; the app does not promise permission or protection from bans.

The two documented original controller firmware images are included under build/firmware/. Vendor updater libraries, personal controller dumps and local research bundles are excluded. Temporary probes, dependencies and generated packages are ignored. Original project attribution is retained.
