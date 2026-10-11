# Stick Labs (Unlimited) 2.2.4

- Added a first-run terms and risk acknowledgment with a 60-second review timer and required acceptance checkbox. App controls remain unavailable until acceptance.
- Covers game-rule and account risks, macros and automated inputs, experimental settings, firmware and hardware damage, saved settings, data loss and responsibility for modifications.
- Acceptance is remembered locally across restarts and updates. Clearing app data shows the acknowledgment again. A storage failure keeps the app locked and reports the problem.
- Added an official Stick Labs link beside the acknowledgment for users who prefer the original app.
- Preserved the separate RC and firmware acknowledgments and the RC reset prompt when quitting.
- Rewrote the README around downloads, features, setup and development. Release history now lives in GitHub release notes.

Validation: type checks, regression tests, production build and dedicated acknowledgment tests passed. The tests cover required acceptance, the 60-second boundary, storage failure and saved acceptance. The dialog was reviewed in the local UI preview.

Includes the Windows setup installer and automatic-update files. Original controller firmware 2.1.0 and 2.2.9 remain bundled and available separately.
