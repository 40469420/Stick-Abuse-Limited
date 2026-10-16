# Stick Abuse 3.1.1: The Beating

## Extremely experimental Tarantula firmware
- Added desktop firmware selection for Tarantula 8K / T3CE: older 2.1.2 and newer 2.4.3 packages. Key and No_Key files are included; bundled buttons select Key.
- When a Tarantula is connected, the firmware page prominently warns that flashing or downgrading is **extremely experimental and could permanently brick the device**. Physical Tarantula flashing, downgrade compatibility and recovery remain untested.
- Requires acknowledgment, a per-flash risk checkbox and a model-specific typed confirmation such as `FLASH TARANTULA 2.1.2`.
- Firmware must match the connected controller family. Native image product/version checks and pinned hashes prevent cross-model or unknown-image flashing. G7 firmware cannot be used on a Tarantula.
- Tarantula backs up all four full 1935-byte profiles before entering update mode. G7 backups remain 1070 bytes per profile.
- The older 2.1.2 Key file has an unresolved MD5 discrepancy against Connect metadata. The UI discloses it. GameSir's native loader accepts its container/header; this does not prove it is safe for a particular controller.

## Profiles and interface
- Combined Profiles and Community Profiles into one Profiles page: controller backup/import controls above the community collection.
- Renamed the shared profile to **Machis main apex**, with its stored deadzone description: left 5% deadzone / 95% anti-deadzone; right 0% / 0%.
- Added the requested bit-depth note: "Anything above 12 is a gimmick, but people want the options so they stay".

## Validation
Type checks, production build, regression tests and fake-controller firmware lifecycle tests passed. Inspect-only native checks accepted six bundled image headers and rejected wrong products, wrong versions and changed hashes. No physical controller was flashed during development. These checks do not establish downgrade or recovery safety.

## Downloads
Setup includes automatic updates from this repository. Portable runs without installation. Firmware remains a desktop-only feature; the separate WebHID website cannot flash controllers.
