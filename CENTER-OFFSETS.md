# Center-offset implementation

Inspected GameSir Connect 1.16.7 installed on this machine, October 10, 2026. Static inspection only; the official application was not launched.

The G7ProCE proxy implements manual center adjustment as a global directional nudge, not an editable profile field. Left/right stick selectors are 0/1; left/right/up/down directions are 0/1/2/3. Each UI click sends a 64-byte zero-padded report beginning `0F E2 <stick> <direction> 00 20` (magnitude 32). Reply `10 E3 00` indicates success; nonzero status indicates failure. Source builder at main.js offset 770976; G7ProCE handler at 807260; acknowledgment handler at 813231. Offsets refer only to this installed version.

The vendor renderer offers four arrows and an original-axis center preview. It explicitly describes the setting as applying across all profiles and says recalibration restores defaults. No absolute-offset query or dedicated reset was found on this G7ProCE path. Other models have different implementations and are not enabled here.

Original-axis preview matches the G7ProCE `ry.push` path: high bytes 54–57 and low bytes 26–29, unsigned centered at 32768, normalized by 32768 below center and 32767 above center. This report representation does not establish physical sensor resolution. The decoder retains fractions instead of rounding the preview to four decimals.

The feature requires a live identified G7ProCE, serializes adjustments, blocks capture during a nudge, waits for the dedicated success acknowledgment, and does not retry a timed-out nudge. A timeout means the outcome is unknown: inspect the center before repeating. The UI disables controls when input is stale or the selected stick is outside its ±30% center-preview window. Profile export/rollback cannot restore global center data. No automatic calibration, reset or firmware write is performed.

Validation: all eight commands exactly matched the isolated installed-vendor builder; analytical fixtures cover low-byte precision, signed extrema, invalid arguments and malformed/rejected acknowledgments. Type checks and tests passed. Simulated UI checks exercised success, rejection and stale-input behavior. Actual controller adjustment remains for the user to verify; development did not send center writes.

## Firmware availability

The installed app includes `resources/dfu/packages/GS_G7_Pro_CE_DV_V229_Key.ufw` and its No_Key variant (controller 2.2.9), plus dongle V135 packages (1.3.5). Availability does not establish decryption, editable code, signature acceptance, rollback support or ban safety. No firmware package was modified or flashed.

Mouse adjustment: drag a preview with the primary pointer button. Each six screen pixels queues one existing fixed-size directional nudge. Commands remain serialized, with at most eight pending; releasing/cancelling the pointer or leaving the page clears pending work. One in-flight command can still complete. Fresh input and the near-center guard are checked before every command. The dot always uses real reported axes; dragging does not simulate absolute offset readback.
