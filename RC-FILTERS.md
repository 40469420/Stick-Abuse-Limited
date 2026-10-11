# RC filters: findings and validation

Target: GameSir G7 Pro 8K, both signed directions. Firmware version still to be established on the user's device.

## What the repository establishes

The inherited codec stores left and right RC settings at Fun_Data +17/+18 (absolute profile offsets 49/50). Its signed scale is −10…+10, encoded as level + 11 (bytes 1…21). Byte 0 is interpreted as neutral/unset and must survive an untouched load/save. Unknown bytes must also survive until explicitly edited. The source attributes this mapping to GameSir Connect's `wn`/`Di` and `Fn`/`Li` functions, but neither that vendor bundle nor the referenced external protocol documentation is included here. Treat the mapping as inherited reverse-engineering evidence, not a new independent hardware verification.

The RC helpers existed without renderer controls. The previous preview used an arbitrary EMA formula; its comment promised negative-level anticipation while the implementation returned alpha 1 for every negative level. Removed this unused simulation and unsupported performance labels rather than presenting them as firmware behavior.

## External evidence and limits

- [GameSir G7 Pro 8K manual](https://gamesir.com/support/manuals/gamesir-g7-pro-aimlabs-edition): official model documentation and GameSir Connect context.
- [GameSir FAQ](https://gamesir.com/support/faq): explicitly documents separate tournament firmware disabling macro/turbo functions. This statement does **not** establish which RC levels any firmware honors. It must not be stretched into an RC support matrix.

Reviewed October 10, 2026. These official sources do not establish a filter transfer function, cutoff frequency, time constant, latency by level, or whether neutral fully bypasses processing. Negative values must not be described as prediction, sharpening, synthetic movement, or aim-assist enhancement without measurement. Profile readback proves byte storage only. No firmware is flashed or downgraded by this feature.

## Implemented workflow

RC filters has independent sliders and exact integer controls from −10 to +10, endpoint/midpoint picks, copying between sticks, and resetting both to neutral. Changes use the existing staged profile and verified write/rollback flow. Unknown or unset bytes remain untouched when merely viewing the page.

The optional 3-second rest comparison first verifies that the edited slot is active and its complete bytes match the controller. Capture runs in the main process on every decoded vendor report, before display throttling; only final statistics cross IPC. It displays report count, measured report rate and elapsed duration, 2D RMS variation around the mean, axis spans, and center offset from (128,128). Comparison rejects changes to other profile bytes or firmware. Results last only while this panel remains mounted; changing slot/reloading clears them. The vendor stream is 8-bit per axis and need not represent the game's input path or USB polling frequency. Rest noise does not measure latency or establish filter activation.

Correction: the initial portable build subscribed to the throttled display stream. Its approximately 55 samples/s could miss short fluctuations. Discard those results for fast-jitter analysis and repeat with the RC capture update. Cancellation is scoped by request ID, and a controller connection change invalidates a capture.

Inspection of the user's signed GameSir Connect 1.11.1 installer independently confirmed the encoding across all 21 settings and all 256 stored bytes. Its renderer labels the negative endpoint Jitter and the positive endpoint Smooth. Those are vendor labels; firmware behavior still needs measurement. The original absence of the bundle described above refers to the repository, not the subsequently inspected installer.

## Automated validation

`npm test` now targets tests actually included in this repository; the previous default referenced seven absent files. RC coverage exercises all 21 levels, left/right byte isolation with realistic name fields across the three existing writable profile geometries, unknown/unset byte preservation, invalid numeric inputs, and analytical rest-noise fixtures. Existing raw-byte, model and Steam codec tests also run. Typecheck and production build are checked separately.

## Hardware validation still required

1. Record firmware and connection mode; close other controller configuration apps.
2. Back up the loaded profile with the existing profile export tools.
3. Keep polling, resolution, curves, deadzones and connection unchanged. Record the baseline at neutral, with both sticks resting.
4. Test one stick at a time at −10, −5, 0, +5 and +10. Write and read back each setting; capture multiple rest comparisons. Restore neutral between series. Repeat for the other stick.
5. Repeat manual movement tests separately. Do not interpret the rest capture as a latency test. Measuring physical-to-output delay needs a controlled stimulus/reference and the actual game-facing input stream.
6. Reconnect and reload to confirm persistence. Record any firmware normalization or ignored settings rather than silently treating readback as working RC.

The software implementation is ready for this hardware validation; RC behavior on the user's unit remains unverified.

## Paired XInput comparison

The Windows-only optional reader uses Microsoft's XInputGetState without applying a deadzone or sending controller commands. Identify the intended slot by moving its stick and rescanning; XInput does not expose a VID/PID, and keyboard controls or virtual controllers can occupy other slots. Changing the selection clears both captures.

The helper prepares before starting the vendor collector, then both collect for approximately three seconds. XInput coordinates retain signed 16-bit fractions in common vendor-count units (divide by 256; reverse Y). This format does not establish physical sensor resolution. Poll counts include repeated states; observed packet-number changes are not USB report counts. The snapshot is before any processing performed by an XInput game. Slot reuse or virtual-device processing remains a limitation; keep devices and configuration unchanged between captures. Cancelling terminates the helper as well as the vendor collector.

The native read-only reader was exercised successfully on Windows. Analytical tests verify sub-count precision, no added deadzone, signed extrema, repeated polls and invalid-data rejection. Hardware RC effects remain unverified.

## RC warning gate

RC controls are greyed out and disabled until the user clicks “I understand Machi”. Acknowledgment lasts only for the mounted panel. The warning cites Apex's official prohibition of jitter aim/RC filters used to exploit aim assist or negate recoil. No RC-specific Call of Duty permission was verified; Activision's broader unsupported-hardware cheating policy does not establish permission. The firmware wording is the fork owner's requested disclaimer, not evidence that a downgrade or custom firmware is necessary or available.

## Apex guard

**Close Apex While RC Is Enabled** is optional and off by default. It watches the supported controller’s stored active-profile settings, not unsaved editor changes. Non-neutral RC arms it; neutral RC disarms it. When armed, it force-closes `r5apex.exe` or `r5apex_dx12.exe` and shows a warning. The preference is saved, and monitoring continues in the tray.

Checks run about once per second and may take longer while Windows or the controller is busy. While a controller cannot be read, the guard retains its last verified RC state; with no verified state it cannot establish protection. Windows may deny process termination. Force-closing can interrupt a match or lose progress, and this feature cannot guarantee ban prevention or stop the game from reading input before termination. It does not terminate launchers or anti-cheat services.

Tests use simulated processes by default. The optional `node tests/apex-native.mjs` check creates and terminates only its own disposable executable to verify Windows detection and force-close behavior.
