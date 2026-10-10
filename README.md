# Stick Labs (Unlimited)

A Windows controller companion forked from [Realkiyoshii/stick-labs](https://github.com/Realkiyoshii/stick-labs). This fork lives at [40469420/stick-labs-unlimited](https://github.com/40469420/stick-labs-unlimited).

The expanded controls target the **GameSir G7 Pro 8K**. Other detected models retain their existing support; detecting a controller does not mean every feature is supported.

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

The GitHub workflow runs for version tags such as `v2.0.1`, checks that the tag matches `package.json`, then runs checks and packaging. A normal source push is not a release. Installed builds contain GitHub updater support; portable copies are separate and should not be relied on for automatic updates. Release publication and an update between two installed versions still need end-to-end verification before announcing automatic updates as ready.

## Feature notes

- [RC filters](RC-FILTERS.md): storage, measurements, warnings and firmware limitations.
- [Center offsets](CENTER-OFFSETS.md): immediate global adjustments and acknowledgment handling.
- [Bindings and macros](CUSTOM-CONTROLS.md): supported outputs, timing and recording limits.
- [Triggers, gyro and calibration](TUNING.md): verified layouts, workflows and validation limits.

Some settings depend on firmware and connection mode. RC filtering effects, expanded outputs and calibration behavior require hardware verification. Raw resolution bytes do not prove physical sensor bit depth. Automated actions may violate a game's rules; the app does not promise permission or protection from bans.

No vendor software, firmware, personal controller dumps or local research bundles belong in this repository. Temporary probes, dependencies and generated packages are ignored. Original project attribution is retained.
