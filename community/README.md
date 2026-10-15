# Profiles & configs

Controller profiles and configurations shared by @Machixo.

## Downloads

| File | Type | Notes |
| --- | --- | --- |
| [Main Apex (All rounder)](https://github.com/40469420/Stick-Abuse-Limited/raw/refs/heads/main/community/profiles/Main%20Apex%20%28All%20rounder%29.sticklab.bin) | Single profile · 1070 bytes | Uploaded by Machixo. Use a matching controller model and firmware. |

Browse [profile backups](profiles/) or [configs](configs/).

## Main Apex (All rounder)

Bindings decoded from the uploaded profile:

| Input | Output |
| --- | --- |
| Left stick click | D-pad Up |
| Capture | Keyboard **T** |
| FL1 | A |
| FR1 | B |
| FL2 | X |
| FR2 | Y |

A is explicitly mapped to A, so its behavior is unchanged. Other standard buttons and triggers retain their original mappings.

- **RC filters:** Left 0, right 0 (neutral/off).
- **Macros:** All four slots contain 0 steps; macros and looping are disabled.
- **Turbo / toggle:** Disabled.

## Using a profile

1. Back up your current profiles in Stick-Abuse-Limited.
2. Click the profile's download link above to download the file directly.
3. For a single `.sticklab.bin` or `.sticklab.json` profile, open **Profiles**, choose the destination slot and use its **Import** control. This overwrites that slot.
4. For a full backup JSON exported with **Backup all**, use **Restore all** instead.

Use matching hardware and firmware. Review the imported settings before launching a game; a shared file is not a guarantee that its settings are permitted.

## Adding files

Open the appropriate folder on GitHub, choose **Add file → Upload files**, then commit the upload. Put controller profile exports in `profiles/`; put macro files and other exported configurations in `configs/`. Add a download link to the table above with the controller model, firmware, app version and a short description when known.

You can rename files. Keep the original extension, including lowercase `.json`. Renaming a file does not change the profile name stored inside it.

Share this page for the collection, or use a file's **Raw** download link for a direct download.
