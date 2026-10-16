# Labs and LeadJoy additions

Implemented locally on `feature/labs-leadjoy`, based on upstream commit `3713d30`.

## Behavior

- Curve designer edits immediately update the working profile. Hardware changes still require Write. Changing curves preserves the selected processing/bypass state and unrelated profile fields.
- Labs includes guided center-to-rim linearity passes with center stability, tremor, consistency and observed output-step analysis. These describe measured movement, not independent sensor accuracy.
- Kernel USB polling captures eight seconds of Windows ETW USB activity after administrator approval. The headline requires the connected controller VID:PID. Completion spacing is not input latency or proof of fresh samples. Leaving, hiding or pausing Labs cancels the capture; writes are blocked while a measurement runs.
- LeadJoy Saber Plus uses a dedicated protocol and workspace for button maps, stick curves/ranges/gates, mouse output and trigger ranges. Main/Sub1/Sub2 maps can be edited. Sub-profile activation is not exposed.
- LeadJoy HID operations run in a worker. Requests validate before opening a handle, and discovery requires the correct vendor HID collection. Writes use acknowledgement and readback, with restoration on mismatch. A transport failure or timeout can leave the current edit unconfirmed; reconnect and reread before retrying. A batch is not an atomic profile transaction.

## Validation

Type checking and production build pass. The regression suite covers the existing fork features, captured LeadJoy protocol fixtures, worker collection/request rejection, immediate curve byte preservation, linearity math, ETW math/parser, PowerShell syntax, and Labs lifecycle/cancellation/write exclusion. Tests use fixtures and simulated hardware; no real games were closed or controller firmware changed.

Physical LeadJoy reads/writes and an elevated ETW capture remain unverified. Test on a backed-up controller before relying on the new support.

## Sources

Protocol codecs, captured LeadJoy fixtures, linearity algorithms and ETW analysis originate from the MIT-licensed [Stick Labs upstream](https://github.com/Realkiyoshii/stick-labs/tree/3713d30). Integration preserves this fork's existing features and adds asynchronous capture, worker isolation and lifecycle validation.
