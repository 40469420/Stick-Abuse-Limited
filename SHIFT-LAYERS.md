# Shift layers

G7 Pro 8K uses one shared Shift profile in slot 5, separate from P1-P4. This mirrors Connect 1.16.7: ShiftProfileNumber=5 and a button mapped to output 231. The button toggle flag chooses hold versus press-to-toggle. Fun_Data shiftEnable/shiftValue controls stick/D-pad swapping and is not used for layer activation.

1. Open Shift beside P1-P4. Optionally copy a saved base profile, then edit its tuning and bindings.
2. Write the Shift layer. This writes/verifies slot 5 without activating it.
3. Return to P1-P4, choose a physical button in Keybindings and click Use as Shift button. Toggle on press selects toggle mode; unchecked means hold. Write the base profile.

A base-profile copy removes Shift activation bindings from the layer, matching Connect's anti-recursion cleanup. Recursive activation is rejected on Shift writes. Support is initially limited to the G7 Pro 8K layout; physical behavior still requires firmware/mode testing.

RC guards, quit checks and automatic resets also inspect the shared Shift layer when the active base profile has a Shift binding. This does not guarantee game-ban prevention. Writes use the existing read-back verification and rollback path. Settings remain staged until written.

## Upstream review through 3713d30

Included real controller reads for Reload from pad, preserving other staged edits, and committing the config session before a real quit. Existing tray/reset prompts remain. Preserved raw bypass, linear/spline designer, RC controls and bit-depth experiments rather than upstream removals. LeadJoy's new hardware protocol and the browser/WebHID build are separate platform/controller additions and are not included in this desktop G7 sync. Existing updater and guards are preserved.
