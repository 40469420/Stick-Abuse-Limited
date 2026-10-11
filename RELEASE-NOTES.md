# Stick Labs (Unlimited) 2.2.3

- Cleaned up all 14 sections with consistent headings, spacing and question-mark help. Explanations are available on demand; live values, required disclaimers and essential operating instructions stay visible.
- Reorganized gyro and trigger tuning, showing activation combinations and output-specific sensitivity when applicable. Exact deadzone values and curve points remain available in expandable panels.
- Separated Lab into Timing & captures, Bit-depth verification and Saved comparisons. Steam exports now stay on Steam; profile editing controls appear only where relevant.
- Added guided 12-bit versus experimental 13/14/16/20/24-bit comparisons using rest and slow-sweep captures, with either vendor original-axis reports or a selected XInput slot.
- Added per-axis output-code evidence from all captured samples: distinct codes, step spacing, code grid and resting noise. Results distinguish finer reported output, additional noise, unchanged spacing and inconclusive evidence. JSON exports include the comparison and device context.
- Bit-depth Apply checks the active profile, writes only the resolution field, verifies readback and detects other profile changes. The original setting is saved locally before writing and can be restored after reopening the page or app. Leaving Lab does not automatically restore it.

Measurement limits: smaller reported steps can come from interpolation or noise. This comparison does not prove physical sensor or ADC resolution. XInput's signed 16-bit fields do not establish a 16-bit sensor. Firmware may ignore experimental requests. Apply can reboot the controller; save or discard pending edits first. Background RC resets can invalidate a comparison by changing other settings.

Validation: all 14 sections reviewed in the local simulated-controller preview; 48 visible help buttons checked. Type checks and the complete regression suite passed, including synthetic bit-depth evidence, native timing-helper and lifecycle checks. The user approved the UI preview. Real-controller precision improvement has not been established.

Downloads: Windows setup installer with automatic updates, plus an optional portable executable for this release. Original controller firmware 2.1.0 and 2.2.9 remain bundled and available separately. Firmware acknowledgments and recovery limitations are unchanged.
