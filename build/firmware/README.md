# Included firmware

G7 Pro 8K (G7ProCE): original 2.1.0 and 2.2.9 Key packages.
Tarantula 8K / Tarantula CE (T3CE): 2.1.2 and 2.4.3, both Key and No_Key packages. Bundled selection uses Key; other allowlisted variants can be selected manually.

Tarantula support is EXTREMELY EXPERIMENTAL. Downgrading/flashing may permanently brick a device. No physical Tarantula flashing or recovery test has been performed. This is not Tarantula Pro (T3Pro) firmware.

Sources: Connect 1.11.1 bundled the older packages; Connect 1.16.7 bundled the newer packages. All four Tarantula files were accepted by GameSir's original image loader and identified as GS_T3CE. Header versions were 2.12 and 2.43, corresponding to model metadata labels 2.1.2 and 2.4.3. These were inspect-only checks with no controller commands.

The older 2.1.2 Key image MD5 is 205ebed53b56bbbe8e1f6f35fa56ce97; extracted Connect metadata lists 175395b4d6fbd049ff14dd61b617cad5. That discrepancy remains unresolved and is disclosed in the UI. The 2.4.3 Key MD5 matches metadata: 98bbf3dd643e2f108998cf3393842299. Native container acceptance does not resolve provenance discrepancies or establish hardware compatibility.

SHA-256 hashes are pinned in src/shared/firmware.ts. Unknown images, mismatched native products/versions, other controller families and receiver connections are rejected. The native worker requires exactly one matching update-mode drive. Profile backups use 1070 bytes for G7 Pro 8K and 1935 for Tarantula 8K. They are settings backups, not complete recovery images. The original updater DLL remains supplied by the installed GameSir Connect app and is not redistributed.
