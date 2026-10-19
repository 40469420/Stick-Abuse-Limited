# Simulated controller

This optional desktop mode allows PC macros on standard controller buttons. Hardware-stored macros remain separate and need no virtual driver.

## User setup

Open Data > Simulated controller. Install ViGEmBus with the optional button, approve Windows elevation, and restart if required. Connect a G7 Pro 8K or Tarantula 8K, select its physical XInput slot, and verify the source by moving its sticks. Install HidHide if it is not present. Enabling simulated mode automatically matches the connected vendor interface to its exact Windows container, registers Stick Abuse and its playback helper, and hides the matching gamepad and XInput parent paths. A separate process outside the allow list must no longer see the physical source, while the playback helper must still see it, before playback starts. A restart may be required after installing HidHide. The app does not hide unrelated devices or replace existing lists. Inactive unrelated hiding entries are saved and temporarily set aside, then restored with hiding disabled when playback stops. Active unrelated hiding rules are preserved. Inverse mode requires resolving that existing setup first.

Enable playback explicitly, then open PC macros. The trigger replaces that button in the virtual output. Hold-to-run, press-once and press-again-to-stop looping modes share the existing sequential macro editor. Keyboard, mouse, normal Xbox buttons and stick directions are supported outputs. Virtual Xbox output cannot represent every vendor-specific button; those buttons can still be macro triggers when the vendor reports expose them.

## Persistence and lifecycle

PC macros save in `virtual-controller-G7ProCE.json` or `virtual-controller-T3CE.json` in local app data. They are not part of controller `.bin` backups. Playback is always off on app launch. Tray close preserves it; actual Quit warns and stops it. The tray has an immediate Stop action. Stale/disconnected vendor input, native source disconnect, app renderer failure, parent exit and heartbeat loss stop playback. Reconnect requires explicit enabling. Recording pauses PC macro playback.

Hardware bindings and unrelated turbo/toggle settings pass through. Each enabled PC macro suppresses its source’s mapped controller outputs. Conflicts identify the affected buttons: shared hardware outputs cannot be suppressed independently; keyboard/mouse firmware output cannot be suppressed through XInput; turbo/toggle on the macro trigger, active hardware macros and Shift need to be disabled before using PC macros. The preflight never rewrites a controller profile. Keep the active hardware profile unchanged during playback. Controller profile changes and measurements through this app are blocked until playback stops.

## Performance and current limits

Native passthrough preserves XInput signed 16-bit axes. Default maximum polling is 1000 Hz; higher options cost CPU and do not establish actual fresh-report rate. Changed states are submitted without synthesizing duplicate frames. Macro trigger detection uses the vendor stream, which may be slower. UI counters measure changed submissions and the driver call, not end-to-end game latency.

Force feedback is not forwarded in this first implementation. Automatic HidHide protection is mandatory for simulated playback. On stop or failed startup, only session-owned hiding and application entries are removed. A local recovery journal and independent native watcher also restore those entries after app exit; recovery retries on the next launch if the control device was busy. Restore physical controller retries cleanup manually. Existing unrelated rules are preserved. Keyboard/mouse injection may be denied by Windows or games. This feature does not establish game-rule permission.

Validation covers the pure timing engine, mocked host lifecycle/persistence/installer rejection, existing quit/tray behavior, native layout/merge self-tests and UI warning flow. Driver installation, real virtual output, rumble and end-to-end hardware latency are not established by those tests. No driver is installed by the test suite.

HidHide CLI reference: https://docs.nefarius.at/projects/HidHide/CLI-Usage/

Source verification uses XInput extended capabilities to compare the physical source VID/PID before and after creating the virtual target, then periodically during playback. A changed identity stops playback. ViGEm's reported virtual user index is not used for source rejection because it can report an incorrect zero index (https://github.com/nefarius/ViGEmClient/issues/31). The Windows capability layout follows the interface used by SDL: https://github.com/libsdl-org/SDL/blob/main/src/core/windows/SDL_xinput.h.
