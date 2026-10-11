# Stick Labs (Unlimited) 2.2.5

- Added **Close Apex While RC Is Enabled** under RC Filters → Background protection. The toggle is off by default and remembered across restarts.
- Checks the supported controller's stored active-profile RC settings. Non-neutral RC arms the guard; neutral RC disarms it. Unsaved editor changes do not arm it.
- When armed, detects and force-closes `r5apex.exe` or `r5apex_dx12.exe`, brings Unlimited forward and displays: **You have RCs enabled. Please close Apex.**
- Monitoring continues while Unlimited is in the tray. The guard reports unavailable controller state and process-check or termination failures. Launchers and anti-cheat services are not targeted.
- Added focused guard tests and an optional Windows-native check that creates and terminates only its own disposable test process. Updated the feature list and RC documentation.

Limits: checks run about once per second and can take longer while Windows or the controller is busy. If the controller cannot be read, the guard retains its last verified RC state; without a verified state, protection cannot be established. Windows may deny termination. Force-closing can interrupt a match or lose progress. This is not a guarantee against bans or against the game reading input before it closes.

Validation: type checks, the complete regression suite and production build passed. Live-preview simulations verified toggle-off, neutral-RC and enabled-RC behavior. A Windows-native test detected and force-closed only the disposable test process; no real game was targeted.

Includes the Windows setup installer and automatic-update files. Original controller firmware 2.1.0 and 2.2.9 remain bundled and available separately.
