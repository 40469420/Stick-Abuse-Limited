Name change because pro players are illiterate and click through disclaimers, shoulda spent more time in school rather than careers in gaming.

## Stick-Abuse-Limited 2.2.8

### New name
- Renamed the app and repository to Stick-Abuse-Limited.
- Updated window/tray labels, setup and portable filenames, download links, and the GitHub updater target.
- Kept the installation identity, saved preferences, profile format, and original-project credits.

### Upstream fixes and additions
- Improved five-point curve fitting to follow custom designs more closely. Linear and spline modes remain separate.
- Prevented dragged or typed curve points from crossing their neighbors; fixed adding a point to a full designer.
- Added Dynamic (CoD) and Zamilitox presets alongside the existing curves. These are static response curves, not the game's dynamic processing.
- Remembered the selected profile slot and spline choice across restarts.
- Added hardware-proven Tarantula 8K keybinding labels for C1-C4 and T1-T3, and Screenshot output code 37. Controller macro recording remains G7 Pro 8K only.

### Kept from this fork
RC controls and game guards, center offsets, calibration, firmware tools, custom bindings/macros, raw bypass, performance and bit-depth tests, and existing controller support remain in place. The separate compatibility inspector is not included in this release.

### Downloads
- Setup: installs the app and includes GitHub auto-updates.
- Portable: runs without installation; update by downloading a newer portable.

### Validation
Typecheck, regression tests, firmware-host checks, and production build passed. Protocol tests use fixtures and simulated hardware; this release does not claim fresh physical testing on every controller.
