## Stick-Abuse-Limited 2.2.9

### Shift layers — G7 Pro 8K
- Added the shared Shift profile in slot 5 beside P1-P4. Edit its sticks, triggers, gyro, bindings and macros using the existing pages.
- Added Use as Shift button in Keybindings. Hold activates the layer temporarily; Toggle on press selects toggle behavior.
- Copy a saved base profile into Shift without changing the original. Shift activation bindings are removed from the copy to avoid recursive activation.
- Writing Shift saves and verifies the layer without permanently activating it. Return to P1-P4 and write the activation binding separately.
- Shift support is initially limited to the G7 Pro 8K profile layout. Firmware and connection mode may affect behavior; fresh physical validation is still pending.

### RC protection
- Game guards, mandatory quit warnings and RC resets now include a reachable Shift layer, even when the base profile has neutral RC.
- Shift activation inside the Shift layer is rejected, including enabled macros that contain Shift output.

### Selected upstream fixes
- Reload from pad now reads the controller's saved curve and transform, keeping other staged edits.
- Real quit commits the configuration session before disconnecting. Closing to tray keeps its existing behavior.
- Kept this fork's RC controls, raw bypass, linear/spline designer, firmware tools and performance suite. Upstream's browser build and LeadJoy additions are outside this update.

### Validation
Typecheck, regression suite, production build and simulated Shift UI checks passed. Tests cover Shift mapping bytes, hold/toggle, copy isolation, unrelated-byte preservation, layer RC detection/reset and quit-session commit. No fresh physical Shift test was performed.

### Downloads
Setup includes GitHub auto-updates. Portable runs without installation; replace it manually when updating.
