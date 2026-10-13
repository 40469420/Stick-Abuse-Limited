# HyperStrike sampling reference (read-only research note)

Reverse-engineered from the HyperStrike Hub web app (helium-flash hub,
Vue SPA bundle `assets/index-DetSq_C4.js`, pulled 2026-10-13 via its
Cloudflare Pages origin — the `evua.cc` domain is ISP-blocked and
unarchived). No Stick Labs code touches these registers. GameSir pads do
not implement any of this; do not send these objects to GameSir hardware.

Evidence bundle: `C:\tools\rea-engines\cases\hyperstrike\`.

## Stick Sampling presets → ADC_SAMPLING section (INPUT ch, id 2)

6-byte object: `[version, mode, presetId, divCode, sampleTimeCode, flags]`.
Mode: 1 = preset, 2 = manual. Version: 1 or 2 (tool writes 2).

| UI preset | presetId | Tier | divCode | sampleTimeCode |
|---|---|---|---|---|
| Extreme | 4 | S | 2 (÷6) | 0 (1.5 cycles) |
| Excellent | 3 | A | 3 (÷8) | 0 (1.5 cycles) |
| Good | 2 | B | 2 (÷6) | 1 (7.5 cycles) |
| Robust | 1 | C | 3 (÷8) | 1 (7.5 cycles) |
| Tier D | 5 | D | 3 (÷8) | 2 (13.5 cycles) |
| Tier E | 6 | E | 3 (÷8) | 3 (28.5 cycles) |
| Tier F | 7 | F | 3 (÷8) | 6 (71.5 cycles) |
| Tier G | 8 | G | 3 (÷8) | 7 (239.5 cycles) |
| Custom (manual) | 0 | — | manual | manual |

Faster (÷6, short window) = rawer/slipperier; slower = steadier/duller.
Factory default is Robust. Tiers D–G require newer firmware — the app
silently downgrades on old firmware.

## Advanced Sampling Level → flags byte 5, bits 5–6 (mask 0x60)

| UI | Value | Meaning |
|---|---|---|
| Off | 0 | native sensor rate |
| 14-bit | 1 | light oversampling |
| 15-bit | 2 | balanced oversampling |
| 16-bit | 3 | strong oversampling |

Version-2 configs only. Bit 4 (0x10) of the same byte = overspec-clock
flag: past the 14 MHz ADC spec limit the app warns experimental-only.

## Stick Quantization → XINPUT_STICK_RESOLUTION (INPUT ch, id 1)

4-byte object `[bits, 0, 0, 0]`. Range enforced 8–12; wire `0` = 12
(Unlimited), else literal bits. XInput path only — DS4 mode is
protocol-fixed at 8-bit.

## Section map (channel → id)

- SYSTEM: USB_RATE 1, USB_INPUT_POLICY 2, USB_MODE 3, FIRMWARE_INFO 4,
  RUNTIME_VERSION 5, REPORT_COALESCE 6, PROFILE_ACTIVE 7, PROFILE_NAMES 8,
  LED_MODE_COLORS 9, BOOT_ENTRY 10
- INPUT: XINPUT_STICK_RESOLUTION 1, ADC_SAMPLING 2, STICK_AXIS_INVERT 3,
  STICK_SPEED_RC_LEFT 4, STICK_SPEED_RC_RIGHT 5 (their RC2.0 filter —
  separate from sampling), LIVE_EXTRA_BUTTONS 6, LIVE_STICK_SPEED 7
- CURVE: LEFT 1, RIGHT 2, PRESET 3, ANTICURVE_RIGHT 4, CIRCLE_CLAMP 5
- MAPPING / KEYBOARD / CALIBRATION sections as in bundle (`ne=` table).

## Legitimacy note

Sampling, oversampling and quantization are first-party firmware signal
conditioning (one physical movement → one reported movement, no
automation). Same class as deadzones/curves — not macros/turbo, not
bannable under ALGS-style rules, which police automation and require
peripheral approval, not stock filter settings.
