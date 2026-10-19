# Tarantula 8K macro support

The Macros page and controller recorder previously accepted only G7ProCE. The editor also listed only four G7 buttons, although T3CE profiles already contain nine 169-byte macro packets.

Protocol evidence: local GameSir Connect 1.16.7 `dist/electron/main.js`, T3CE model `cm`, proxy `dm`, codec values `yg`, key map `hg`/`mg`, original-state decoder `em.push`.

- Profile: 1935 bytes; function packets begin at 0xB0, nine packets of 169 bytes. Existing profile geometry and upstream live-profile proof are covered by tests/t3ce.ts.
- Physical packet order: FL1, FR1, Ext1-Ext7. T3CE Mapping names these C1-C4, T1-T3. Connect defaults include a macro object on all nine.
- Macro packet format remains the existing 11-byte header and 32 sequential steps. Step 32 has no trailing delay.
- Original buttons use the report slice 53..63. FL1/FR1 are byte 60 bits 3/4; Ext1-Ext7 are byte 61 bits 0..6. Bytes 62/63 are trigger values, not G7 FL2/FR2 bits.
- Output codes 31..39 mean Ext1-Ext9 on T3CE; codes 31/32 and 37 have different G7 labels. Labels and pickers now use the connected model.
- Tarantula Pro/T3Pro remains unsupported; it uses a separate native protocol.

Validation uses synthetic profiles/reports, UI component tests and fake controller lifecycle tests. No physical Tarantula playback has been tested. This establishes encoding and UI behavior, not a hardware playback guarantee.
