# Stick Labs (Unlimited) 2.2.1

- Added upstream's experimental **13-, 14-, 16-, 20- and 24-bit quick picks** and corrected their selected-button highlighting. These write raw firmware settings; they do not establish higher physical sensor resolution or higher-resolution game input. Firmware may clamp or ignore them.
- Kept Unlimited's existing custom 8–12-bit input alongside the new quick picks.
- Added the upstream read-only Marius board preview, identity/configuration display and reference-vector tests.
- Added clearer connection-timeout troubleshooting guidance.
- Merged the nine upstream commits while preserving Unlimited's RC filters, center controls, bindings, macros, firmware page, branding and updater.
- Kept Unlimited's calibration workflows unchanged; the upstream calibration bench was intentionally excluded.

Validation: type checks, production build, synthetic regression tests and upstream Marius tests passed. The merged local portable was tested and confirmed working by the user.

This release contains the Windows setup installer and updater metadata. No portable is published. Original controller firmware 2.1.0 and 2.2.9 remain included in the app. Firmware flashing risks and recovery limitations are unchanged.
