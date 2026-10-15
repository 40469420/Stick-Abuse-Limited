# Upstream review — 2026-10-15

Reviewed Realkiyoshii/stick-labs through `abbd32d` against this fork at `b845f29`.

## Included

- `d514fc0`: keep curve points ordered when dragging or typing; return a new array when the designer is full. Applied to both local designers.
- `fa5049f`, `27b1ff2`, `e7f3814`: improved five-point curve fitting and regression checks for linear/spline staging. Fitting is cached between edits so live input updates do not repeat it.
- `704607b`, `0a54010`: remember the selected profile slot and spline sampling choice.
- `5ae8440`, `f73242f`, `7c03023`: Dynamic (CoD) and Zamilitox presets, alongside this fork's existing presets. These are static response curves.
- `5138e67`, `0720a9c`: hardware-proven Tarantula function packet labels (FL1, FR1, C1–C4, T1–T3), available in this fork's keybinding UI, plus Screenshot output code 37. Macro recording remains limited to the previously supported G7 Pro 8K.

## Left out

- Branding, release versions, theme changes, tab removals, and replacements of this fork's existing UI.
- Duplicate center trimming, raw bypass, output locks, write verification and explanatory help changes already implemented here.
- Calibration bench replacement; retained this fork's workflow.
- Removal of Flydigi/Marius features and existing controller entries.
- LeadJoy detect-only/codec research: no usable tuning support; the separate compatibility inspector remains the collection tool.
- Extra linearity and elevated ETW bench workflows: separate additions rather than required fixes; retained this fork's performance and bit-depth suite.
- Renaming quantization levels or removing experimental controls; retained existing labels and measured bit-depth controls.

This is a selective port, not an ancestry-only merge. GitHub may still show upstream commits behind. Unrelated commits are not marked merged merely to clear that counter.
