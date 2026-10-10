# Controller firmware

The Firmware page supports the GameSir G7 Pro 8K over direct USB. Original controller images **2.1.0** (from Connect 1.11.1) and **2.2.9** (from Connect 1.16.7) are included. Receivers are not flashed. GameSir Connect must be installed for its original updater library, which is not redistributed.

Read the disclaimer and click **I understand Machi** to unlock the controls. Validate an image, accept the per-flash risk checkbox, and type the exact `FLASH <version>` confirmation. Save or discard unsaved profile edits. Fully quit Connect, including its tray process, before flashing.

All four profiles and session information are saved before the Quick Update command. These are settings backups, not complete firmware dumps or guaranteed recovery images. The app validates the bundled 2.2.9 return image and runs a native self-check against an invalid drive before changing controller mode. The worker requires exactly one matching update-mode controller before calling GameSir's write API. Modified or unknown firmware hashes and receiver images are rejected.

Keep USB connected and Windows awake. Do not terminate the app during a write. Controller operations, quitting and update installation are blocked during flashing. Logs are written as the worker runs; use **Open saved profiles and flash log** afterward. There are no automatic flash retries or automatic profile restores.

After completion, rescan and reconnect, then verify the reported version. The development controller reported **0210** after the corrected updater test, confirming 2.1.0 was running on that unit. This does not establish compatibility with every hardware revision, receiver compatibility, calibration preservation, restored RC behavior or guaranteed recovery.

Only open Connect after the Stick Labs updater has finished or stopped. Connect restored the test unit from update mode, but some failures may require hardware repair. Opening Connect with downgraded firmware may automatically upgrade it again. Never run the two updaters together. The vendor's dual-backup option is retained; automatic fallback has not been independently verified on this controller.

## Included image hashes

| Image | SHA-256 |
| --- | --- |
| `GS_G7_Pro_CE_DV_V210_Key.ufw` | `29aa64506ad9fbb347d1e3681a79db4563b78eb93aea6298eae7d952df8e4cae` |
| `GS_G7_Pro_CE_DV_V229_Key.ufw` | `4d2982df76d92f0ef7564a98005c8b01c25e0c9d1f995becbe1afe72e55882c4` |

## Worker checks

The x86 host reserves 2 MB of native stack. Windows PowerShell's 256 KB default reproducibly caused `0xC00000FD` in the vendor device-query routine; the same fixed invalid-drive call completes normally in the replacement host. The vendor DLL is not patched. Firmware data stays pinned for the worker lifetime. A disconnect I/O error during Quick Update is logged and does not skip independent update-mode detection.

Tests cover hash rejection, progress parsing, profile backups, operation/quit locks, handoff errors, host architecture/stack size, and worker success/error handling. Fake-hardware and invalid-drive checks do not flash a connected controller.
