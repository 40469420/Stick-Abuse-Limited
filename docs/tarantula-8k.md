# Tarantula 8K (T3CE) — hardware research + app-claim audit

Researched 2026-10-14. Sources: gamesir.com product page, GameSir Connect
1.16.7 bundle (local RE), EnosTech + ETA Prime + Deegital Tech reviews,
r/Gamesir, gamepadla.com spec/test pages, VaktorTV (stick modules),
live hardware (PID 0x103d, firmware 0243, 1935-byte dumps).

## Public hardware facts

- Wired-only USB-C PC pad, $69.99, 180 g (no battery, no rumble motors),
  158×100×61 mm, symmetric PlayStation-style layout, orange shell.
- Sticks: Gen-2 Mag-Res TMR, 5M-cycle modules, 6 swappable caps.
  **Official product page: "12-bit industrial-grade ADC chip."**
  G7 Pro 8K uses custom 5-pin JS13 Pro angle-TMR modules (VaktorTV);
  Tarantula shares the Gen-2 family; per-chip part numbers are NOT public.
- Triggers: Hall analog + microswitch stops (rear hardware switches).
- ABXY: micro switches (5M clicks). D-pad: tactile switches.
- Extras: 9 remappable (FL1/FR1 rear lockable, C1–C4 front, T1–T3),
  32-step macros, turbo 10/20/30 Hz on up to 8 buttons, 4 profiles.
- 6-axis gyro, RGB (Static/Breathing/Colorful/Rainbow/Radar), 3.5 mm jack.
- Polling: 250/1000/4000/8000 gears in Connect (no 500/2000 offered).
- Modes: XInput primary; community reports DS4 and Switch modes exist
  (gyro ~800–1000 Hz there). Wired-only ⇒ no FCC filing exists.

## App-claim audit (all hold, gaps marked)

| Claim | Status |
|---|---|
| 1935-byte profile layout | ✅ proven vs live dumps |
| 9 function packets [FL1,FR1,C1–C4,T1–T3] | ✅ press tests + matches 9-button spec |
| Gear table 250/1000/4000/8000 | ✅ Connect dashboard (review screenshots) |
| 12-bit ceiling | ✅✅ official product page |
| Deadzone/curve/outer codec | ✅ fixtures + live writes |
| Macros 32-step layout | ✅ matches public spec (untouched by design) |
| Turbo bytes | ✅ deliberately untouched (tournament scope) |
| Center trim `0F E2` | ⚠️ UNPROVEN — implemented from Connect RE, never hardware-tested |
| Hair trigger Off/Adaptive/Fixed | ⚠️ exists in Connect, not exposed (deadzone-only by design) |
| DS4/Switch modes | ⚠️ out of scope (XInput/vendor channel only) |
| Gyro/motion/light | ⚠️ documented non-goals |

## Motherboard note

No public source names the MCU or ADC part numbers on the Tarantula 8K
board. Teardowns show assembly only; wired-only means no FCC internal
photos. The 12-bit figure is vendor-stated (product page), not inferred —
it is the strongest ceiling evidence available short of decapping.
