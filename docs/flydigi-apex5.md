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
