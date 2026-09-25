# InspectHero (`et4u`) — SVG Symbol & Prototype Library Parity Audit

## Comprehensive Analysis of CAD & Electrical Symbol Representations

This audit maps every electrical, fire safety (BMA), HVAC, and cable symbol defined in the InspectHero engineering system, comparing its rendering pipeline on Web vs Mobile.

---

### 1. Master Symbol Inventory & Rendering Pipeline

| Symbol ID | German / Technical Name | Category | Database Source | Web Representation | Mobile Representation | Parity Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `sym_socket` | Steckdose 230V 1-fach | Circuits | `stromkreise` | Inline Vector SVG (DIN 40900 Arc & Ground line) | Generic Circle Div + Emoji 🔌 | **VISUAL_INFORMATION_LOSS** |
| `sym_socket_2x`| Steckdose 2-fach | Circuits | `stromkreise` | Vector SVG Double Socket Glyph | Generic Circle Div + Text "2x" | **VISUAL_INFORMATION_LOSS** |
| `sym_cee16` | CEE Steckdose 16A | Circuits | `stromkreise` | Vector SVG 5-Pin CEE Glyph + "16A" Badge | Generic Red Div + Emoji ⚡ | **VISUAL_INFORMATION_LOSS** |
| `sym_cee32` | CEE Steckdose 32A | Circuits | `stromkreise` | Vector SVG Heavy CEE Glyph + "32A" Badge | Generic Red Div + Emoji ⚡ | **VISUAL_INFORMATION_LOSS** |
| `sym_edv` | EDV / LAN RJ45 Dose | Circuits | `stromkreise` | Vector SVG Square with Ethernet port icon | Generic Green Div + Emoji 🌐 | **VISUAL_INFORMATION_LOSS** |
| `sym_light` | Deckenleuchte (Licht) | Lighting | `stromkreise` | Vector SVG Circle with 4 diagonal rays | Generic Yellow Div + Emoji 💡 | **VISUAL_INFORMATION_LOSS** |
| `sym_switch` | Lichtschalter / Taster | Lighting | `stromkreise` | Vector SVG Switch Toggle Glyph | Generic Yellow Div + Emoji 🔘 | **VISUAL_INFORMATION_LOSS** |
| `detector_blue`| Optischer Rauchmelder (D-Melder) | BMA | `bma_devices` | Vector DIN EN 54 Circular Smoke Chamber Glyph | Generic Red Div + Emoji 🚨 | **VISUAL_INFORMATION_LOSS** |
| `detector_red` | Mehrkriterienmelder (OT Melder) | BMA | `bma_devices` | Vector DIN EN 54 Dual Concentric Ring Glyph | Generic Dark Red Div + Emoji 🚨 | **VISUAL_INFORMATION_LOSS** |
| `thermo_melder`| Thermomelder (Wärmemelder) | BMA | `bma_devices` | Vector DIN EN 54 Heat Sensor Glyph | Generic Red Div + Emoji 🔥 | **VISUAL_INFORMATION_LOSS** |
| `handmelder` | Handfeuermelder (ROP / Druckknopf) | BMA | `bma_devices` | Vector DIN EN 54 Square ROP Box with Center Dot | Generic Red Box + Emoji 🛑 | **VISUAL_INFORMATION_LOSS** |
| `sirene` | Akustischer Signalgeber (Sirene) | BMA | `bma_devices` | Vector DIN Horn / Acoustic Cone Glyph | Generic Orange Div + Emoji 📢 | **VISUAL_INFORMATION_LOSS** |
| `bmz` | BMA-Brandmeldezentrale | BMA | `bma_devices` | Vector Master Panel Enclosure Glyph | Generic Dark Red Box + Emoji 🏢 | **VISUAL_INFORMATION_LOSS** |
| `notlicht_pikto`| Notausgang Rettungszeichen (4 Richtungen)| Notlicht | `bma_devices` | Vector Green Emergency Exit Arrow (⬅️ ➡️ ⬆️ ⬇️) | Generic Green Div + Arrow Emoji | **PARTIAL** |
| `warmepumpe_aussen`| Wärmepumpe Außeneinheit | Heating | `bma_devices` | Vector Fan Condenser Unit Blueprint Glyph | Generic Blue Div + Emoji ❄️ | **VISUAL_INFORMATION_LOSS** |
| `warmepumpe_innen` | Wärmepumpe Inneneinheit (Hydrobox) | Heating | `bma_devices` | Vector Hydraulic Controller Enclosure Glyph | Generic Blue Div + Emoji 🏠 | **VISUAL_INFORMATION_LOSS** |
| `kabeltrasse` | Kabelpritsche / Steigtrasse | Cables | `cables` | Orthogonal Vector Ladder / Mesh Tray Layer | Generic Point Dot without Tray Width | **SVG_LAYER_MISSING** |
| `revisionsklappe`| Revisionsklappe (Brandschutz) | Klappen | `plans` | Vector Square Hatch with Diagonal Hatching | Generic Amber Div + Text "40x40" | **PARTIAL** |

---

### 2. Architectural Root Cause Analysis

1. **Web Implementation:**
   * Utilizes pure inline SVG templates dynamically generated based on `type`, `fuse_type`, and `metadata.rotation`.
   * Scales dynamically using SVG `vector-effect="non-scaling-stroke"`, preserving crisp lines regardless of zoom depth.
2. **Mobile Implementation:**
   * The Leaflet HTML template inside `apps/mobile/app/plans/[id].tsx` simplified symbol rendering by injecting standard HTML `<div>` nodes with CSS border-radii and emoji text content to minimize JavaScript execution overhead in early prototypes.
3. **Remediation Requirement:**
   * Port the SVG generator function `makeStromkreisIcon` and BMA vector definitions directly into the mobile Leaflet HTML generator script, rendering 1:1 vector glyphs instead of emoji circles.
