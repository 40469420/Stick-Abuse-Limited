# Stick-Abuse-Limited

> [!WARNING]
> ## ⚠️ DISCLAIMER ⚠️
> This version has no affiliation with the original outside the owner knowing it exists. My beliefs on these features are my own and my own only. At no point can you run games with official stances while in bannable/abusable states. Do not bother. Create your own fork.

A Windows controller companion with expanded tuning, bindings, macros and performance testing. Built on [Stick Labs by Realkiyoshii](https://github.com/Realkiyoshii/stick-labs), with the Stick-Abuse-Limited fork maintained by [@Machixo](https://x.com/Machixo).

The full feature set targets the **GameSir G7 Pro 8K**. Other supported controllers keep their existing controls; availability depends on the model, firmware and connection mode.

## Download

Get the installer from [GitHub Releases](https://github.com/40469420/Stick-Abuse-Limited/releases/latest). Installed copies check this repository for updates and offer to restart when an update is ready. Portable builds, when listed on a release, are separate downloads.

Prefer the original app? [Official Stick Labs](https://github.com/Realkiyoshii/stick-labs).

## Shared profiles & configs

Browse [Machixo’s profiles and configs](community/README.md) for downloadable backups, import instructions and shared settings.

## Features

- **Shift layers (G7 Pro 8K):** a shared alternate profile with hold/toggle activation and independent tuning, bindings and macros.


| Section | Controls |
| --- | --- |
| Sticks | Live original-axis/range previews, precise sliders with nudges, deadzones, anti-deadzones, custom response curves staged immediately with optional spline smoothing, shape, linear full-range preset and separate PureRaw and PureRaw Deadzone (Processing) options. |
| Device | Polling-rate settings, standard 8–12-bit resolution and experimental higher-bit requests. |
| Center offsets | Independent stick-center adjustment with directional nudges, mouse dragging and live previews. |
| Triggers | Live output gauges and staged range visualization. Separate LT/RT input and output ranges, adaptive/fixed hair triggers and response curves. |
| Gyro | Live stick plots and raw gyro/accelerometer words. Aim/Tilt configurations, activation combinations, yaw/roll mapping, inversion, sensitivity and response tuning. |
| Keybindings | Controller, keyboard and mouse outputs; up to three simultaneous outputs, toggle and turbo. |
| Macros | Button/key recording, editable hold and delay timings, step reordering and duplication, playback preview, and reusable files. |
| Calibration | Sticks, triggers, combined calibration, motion sensor and guided fine stick tuning. |
| RC filters | Independent −10 to +10 levels, noise comparisons, optional reconnect resets and independent force-close guards for Apex, The Finals, Battlefield, Rainbow Six Siege and Destiny 2. |
| Profiles | Read, back up, restore and transfer controller profiles. |
| Lab | Report timing, XInput state-change rates, center noise, range, snapback, trigger sweeps, guided linearity passes, elevated kernel USB completion-rate testing and saved comparisons. |
| Bit-depth verification | Guided 12-bit versus higher-bit captures, per-axis output-step and noise comparisons, restoration and JSON export. |
| Steam | Export stick settings to supported Steam configurations. |
| Firmware | G7 Pro 8K controller flashing, image validation, profile backups and logs. Original 2.1.0 and 2.2.9 images are included. |
| Marius | Read-only board discovery and configuration preview. |

PureRaw has an enabled-by-default **Auto reapply on reconnect** checkbox. While the app is running, it temporarily enables Square processing for PureRaw sticks in the active G7 Pro 8K profile, verifies the write, then restores the exact original profile. Other tuning is preserved. Interrupted operations keep a local recovery backup. This is an app-assisted workaround; physical reconnect validation is pending.

The **Theme** button lets you customize backgrounds, panels, controls, borders, text, accents, status colors and preview markers. Colors are saved on your PC. Explanations sit behind **?** help buttons. Closing the window keeps the app in the tray. Quitting with RC enabled prompts you to reset it first.

LeadJoy Saber Plus has a dedicated workspace for button remapping, stick curves, ranges and gates, mouse output, trigger ranges and Labs. Writes read back the affected settings for verification. Main and sub-profile editing are supported; sub-profile activation is not exposed. Physical-device validation is still pending.

Flydigi Apex 5 also supports stick curves, deadzones and LED brightness through a Python hidapi bridge. It requires Python with the `hidapi` package installed. Close Flydigi Space Station before connecting. Unmapped controls stay disabled.

## Getting started

1. Close GameSir Connect so it releases the controller.
2. Connect by USB or a supported 2.4 GHz receiver, rescan, and choose the controller interface marked **★**.
3. Back up your profiles before changing settings.
4. Select a profile, make your changes, then choose **Write to controller**.

Center offsets and calibration act immediately. Writing the active profile can briefly disconnect the controller. The bit-depth test changes resolution only with **Apply**; leaving the page does not restore it automatically.

## Before you use it

The first launch shows a risk acknowledgment with a 60-second review period. Acceptance is saved locally; clearing app data shows it again. RC and firmware pages retain their separate acknowledgments.

Macros, turbo, RC filters and other modified inputs may violate game or tournament rules and can lead to bans. Experimental settings may behave differently across firmware versions. Firmware flashing can permanently disable a controller; recovery is not guaranteed.

Lab reports software-observed behavior. Higher-bit labels and smaller reported steps do not prove sensor resolution, USB polling rate or physical input latency.

## Documentation

- [RC filters](RC-FILTERS.md)
- [Center offsets](CENTER-OFFSETS.md)
- [Bindings and macros](CUSTOM-CONTROLS.md)
- [Triggers, gyro and calibration](TUNING.md)
- [Firmware instructions and recovery limits](FIRMWARE.md)
- [Release notes](https://github.com/40469420/Stick-Abuse-Limited/releases)

## Development

Use Node.js 22 LTS.

```powershell
npm ci
npm run dev
```

Run checks and build the app:

```powershell
npm run typecheck
npm test
npm run build
```

Build a Windows installer:

```powershell
npm run dist -- --publish never
```

For a local portable build, use `npm run dist:portable -- --publish never`. Packages are written to `dist/`. The updater points to this fork. Version tags trigger the installer release workflow.

Automated tests use synthetic data and simulated devices. Hardware probes are opt-in. Generated packages, private dumps and vendor updater libraries are excluded from source control.

## Credits

Developed by **RealKiyoshi** · [YouTube](https://www.youtube.com/@realkiyoshi)

Forked by **@Machixo** · [X](https://x.com/Machixo)

[MIT license](LICENSE)
