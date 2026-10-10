# Stick Labs (Unlimited) 2.2.0

- Added the **Firmware** page for G7 Pro 8K controller updates, with original controller firmware **2.1.0** and **2.2.9** included in the repository and installer.
- Added a large caution-tape **DISCLAIMER** with the requested risk/recovery wording. Controls remain greyed out until **I understand Machi** is clicked. A separate risk checkbox and exact typed version confirmation are required for each flash.
- Save all four profiles before updating; validate firmware hashes and controller identity; retain live updater logs and block competing operations and quitting during a flash.
- Fixed the Quick Update disconnect I/O handoff and the native worker stack overflow. A native self-check now runs before entering update mode.
- Installed copies continue updating from this GitHub fork. This release includes a setup installer and updater metadata; no portable builds or personal backups are published.

GameSir Connect must be installed for its updater library and fully quit during flashing. Firmware updates can destroy a controller. Profile backups and dual-backup mode do not guarantee recovery. Connect restored the test controller after a failed attempt, and the corrected test controller subsequently reported 2.1.0. This does not establish compatibility or RC behavior on every device. Opening Connect with downgraded firmware can upgrade it again.

Validation: TypeScript checks, application/fake-controller regression tests, x86 host success/error checks, packaged firmware hashes and native parser/preflight checks. The stack overflow was reproduced and resolved using a fixed invalid-drive target without calling the flash API.
