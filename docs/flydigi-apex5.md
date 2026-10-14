# Flydigi Apex 5 (k5) — Space Station RE: polling & precision

Reverse-engineered 2026-10-14 from Space Station v4.1.4.0 (Electron
asar + .NET service binaries, local install). Status: UI-level values
and IPC shapes recovered; **USB wire encoding still unknown** — no new
writes may ship until live hardware proves them.

Evidence: `C:\tools\rea-engines\cases\flydigi-spacestation\`
(bundle pulls, carved .NET IL, service-log survey).

## Chain

Renderer (enums/UI) → protobuf IPC (`IpcCommandEnum_*`, `{uid, value}`)
→ `devicespace` service → `Flydigi.ControllerSDK.ControllerSdk`
(single-file bundled IL, in-memory only) → USB HID (0xFFA0).

## Recovered values

**JoystickPrecision** (renderer enum, exact):
None=0, 8Bit=1, 10Bit=2, 12Bit=3, 9Bit=4, 11Bit=5, 14Bit=6, 16Bit=7.

**JoystickSensitivity** (renderer enum, exact):
None=0, Highest=14, High=15, MiddleHigh=16, Middle=17, LowMiddle=18,
Low=19, Lowest=20. Curve types Default/Quick/Slow/Custom match our
curve type bytes 1/2/3 path (already shipped).

**IPC commands** (main.js enum, exact): UpdateReportRate=4179
`{uid, rate}`, UpdateJoystickSensitivity=4181 `{uid, sensitivity}`,
UpdateJoystickPrecision=4182 `{uid, precision}`,
EnableJoyStickDebounce=4183, EnableJoystickAutoCalibration=4184,
UpdateSleepTime=4180. Full 52-command `*NewXInput` surface enumerated
in evidence notes.

**k5 button-id map** (`device_config_k5.js`): JsLeft=240, JsRight=241,
Lt=12, Rt=13, M1–M5=18–22, Fn=24, Home=27 — for future mapping work.

## Second pass: UI wiring (renderer chunks, exact)

**Polling picker** (`setting_controller_joystick_polling_rate_*`):
value 1 = 1000 Hz, 2 = 500 Hz, 3 = 250 Hz, 4 = 125 Hz. `reportRate`
state is this small enum (default 1); no deviceCode gate found around
the picker. IPC: `{cmdId: UpdateReportRate, uid, reportRate}`.

**Precision picker** (`setting_controller_joystick_accuracy_*`):
12/11/10/9/8-bit offered; fp4 hides the 12-bit row. (Enum also defines
14/16-bit, unoffered in this UI.) IPC: `{cmdId:
UpdateJoystickPrecision, uid, precision}`.

**Sensitivity UI**: joystickCenter (0–100, deadzone center %), joystickEdge
(±100), sensitivityPoint1/2, types default/real_time/delay/custom with
curve anchors (real_time {64,96}, delay {64,32}). Center-deadzone tip
confirms center semantics. IPC: `{cmdId: UpdateJoystickSensitivity,
uid, sensitivity}`.

**Global toggles** (each its own IPC command): joystick debounce
(EnableJoyStickDebounce), joystick auto-calibration
(EnableJoystickAutoCalibration), rebound/snapback filter
(EnableJoystickRebound), motion debounce, sleep time.

**Vendor reference data** (accuracy tip, verbatim semantics): Xbox
Series/Elite 2 = 9-bit/125 Hz, DualSense = 8-bit/250 Hz, DualSense
Edge = 8-bit/1000 Hz. Vendor's own words: higher bit depth needs
shorter minimum travel; slightly lower precision sometimes matches
games better.

**Vendor debounce note** (verbatim semantics): sticks ship with a
debounce algorithm; off, data fluctuates in 0.001–0.002 (normal),
auto-calibration requires debounce on; FPS players are advised to
turn it off. **Rebound note**: off removes reverse-data filtering on
release — recommended off for Apex/COD for more responsive
direction changes.

## Explicitly unknown (do not guess)

- USB encoding of report-rate and precision (A-command vs section
  write, section IDs, payload layout). Not in the JS bundle, service
  logs, or statically reachable IL.
- Which rates k5 offers in its picker UI (option lists live in renderer
  chunks not yet traced to values).
- Sensitivity presets beyond curve points (real_time/default/delay
  anchors seen, not byte-mapped).

## Unlock condition

Apex 5 hardware on the desk: set polling/precision in Space Station
while capturing USB (or drive our A-channel writes and read back).
Until then this file is the complete, honest state of knowledge.
