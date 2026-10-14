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

## PROVEN 2026-10-14 (precision write path, live hardware)

- Write: command `0x15`, args `[0x03, value, (value + 0x18) & 0xFF]`
  (12→`[03,03,1B]`, 11→`[03,05,1D]`, 10→`[03,02,1A]` — all three
  captured from Space Station flips).
- Ack: reply `[0x01, 0x00, value]`.
- Read: command `0x03` args `[0x02, 0x05]`; precision enum at reply
  index 12 (3 = 12-bit, 2 = 10-bit, live-verified).
- Our byte sequence proven on hardware: wrote 12-bit, ack matched,
  0x03 readback confirmed enum 3. UI picker unlocked on this proof.
- Behaviorally confirmed separately: 11-bit output sits on a mod-32
  grid (2048 levels), 12-bit on mod-16 (4096) — XInput sweep analysis.
- Still open: report-rate USB bytes (polling fixed at 1000 Hz on k5,
  nothing to write), sensitivity preset bytes, trigger bytes.

## PROVEN 2026-10-14 (M1 remap write path, live hardware)

- M1 field: one byte in each mirror section 07–0B (offsets
  229/203/179/157/151); values are k5 button IDs (A=4, B=5, X=7 —
  three points). Store offset 82 tracks M1 in the 1092 B store.
- Save chain (Space Station B→X pcap, byte-exact): 0x11 select
  `[07 FF 00 FF FF FF 14]` (ack `[01,00,01,00]`), A4 announce section
  `0x03` len `0xC2`, one A5 patch (27 B window: seven (00,value,00)
  triplets, M1 in slot 2, checksum `(0xBD + sum[0:23]) & 0xFF`),
  A6 save with fresh nonce. Pad fans out to 07–0B mirrors.
- Our bytes proven: no-op B-rewrite acked end to end, then B→X→B
  round trip pad-confirmed both legs (mirrors + store@82), curves
  intact, store parses. Mapping saves reboot the pad — the version
  stamp read can race, so the app retries it; ack + store@82
  readback verify every write.
- Store `@280-281` follows every save (save-stamp words, benign).
- M2 proven the same way (FF→Y→B tracked at mirrors + store@85;
  Y→B pcap showed M1+M2 sharing record 00, triplet slots 2+3, cksum
  C0 — the additive rule re-confirmed on a two-ID sample).
- LM proven in record-00 slot 6 (store@94); RM proven in a second
  table, section 0x04 len 0xC3, slot 0 (store@102) — same 0xBD
  checksum idiom over 21 bytes, five confirmations total.
- Multi-button writes carry the live values of all managed slots
  (M1-M4); anything unmanaged resets to default, and the UI confirm
  says so. Turbo is excluded from targets by policy — never.
- Open: other buttons' triplet slots (one flip each through the same
  diff pipeline — M3→? decodes the next), sensitivity/trigger bytes.
