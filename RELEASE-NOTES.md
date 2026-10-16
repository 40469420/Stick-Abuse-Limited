# Stick Abuse 3.1: The Beating

## PureRaw reconnect fix
- Added **Auto reapply on reconnect**, enabled by default. While the app is running, PureRaw sticks briefly pass through Square processing before their exact original profile is restored. This resolves the slow-stick state observed after unplugging and reconnecting the test G7 Pro 8K.
- Recovery verifies writes, preserves tuning and keeps a local backup if interrupted. The checkbox lets you disable automatic reapplication.
- Added **PureRaw Deadzone (Processing)** as a separate option. It uses a neutral response curve with processing enabled while keeping deadzones and anti-deadzones.
- Corrected the PureRaw preview: stored deadzone and anti-deadzone settings remain visible alongside actual reported output. PureRaw does not guarantee that firmware bypasses every processing stage.

## New icon
- New red joystick icon for Windows, setup, portable and the system tray.
- A gentle breathing animation sits beside the app name and links to this GitHub repository. Reduced-motion preferences are respected.
- Windows executable branding identifies the app as Stick-Abuse-Limited.

## Community Profiles
- Added **Community Profiles** under **Data**, with the current public GitHub collection and a Refresh button.
- Download profiles directly through a Save dialog, then import them through Profiles. Downloading does not change the controller.
- No GitHub login or token is needed. No controller data or personal files are uploaded.

## Validation
PureRaw recovery and lifecycle tests, community download tests, type checks and production builds passed. Reconnect recovery was confirmed on the test G7 Pro 8K. Community listing and a 1070-byte profile download were verified against the public repository.

## Downloads
Use **setup** for installation and automatic updates from this repository. Use **portable** to run without installation.
