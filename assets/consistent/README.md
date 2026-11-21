# Consistent guide cards

All 21 guide cards are composed on the same blank master derived from **01 — Abundance as a Mindset**. The separate website mockup is preserved in `reference/`; it is a reference image, not a guide card.

Open [index.html](index.html) for the review gallery, or [contact-sheet.jpg](contact-sheet.jpg) to see the complete set at once.

- `png/` — 21 finished, opaque PNGs at exactly 1671 × 941 pixels.
- `editable/` — matching, self-contained SVGs with real text, editable rules and callout frames, and embedded imagery.
- `template/blank-card.png` — the one shared paper and outer border, reused without regeneration.
- `template/style.json` — shared font family, colors, default type sizes, margins, and title and number positions.
- `template/generation.txt` — the exact blank-master prompt and generation method.
- `content.txt` — the complete rendered editorial copy in readable text form.
- `copy-audit.json` — rendered text, source-image hashes and text bounds for each card.

## How consistency is maintained

Only the empty master was produced with the built-in image generation tool. Titles, paragraphs, accents, rules and boxes are composed deterministically in SVG. Future edits should update the source text or shared style and rerender; do not regenerate complete cards individually.

Original engravings are reused with explicit cutout boundaries and one shared ink filter that removes their old paper. The four labels inside the Orbits of Influence engraving remain embedded in that original illustration. All other editorial copy is real text. The wording and printed page numbers are retained, including the original `No. 03` on Abundance and `No. 04` on Inner Work. Text sizes and layouts adapt to content density.

The original PNGs and original download remain untouched. SVGs use Times New Roman; the PNGs have fixed typography on every device. For the website, reuse this master and the structured text in `content/cards.json` through a shared component.

## Rebuild

From the repository root:

```sh
python3 tools/build_cards.py
```

Requirements: Python 3, Pillow, librsvg (`rsvg-convert`), and Times New Roman. The renderer uses the macOS font directory by default; set `NEWLY_RICH_FONT_DIR` to another directory containing the same four Times New Roman font files when needed.

To rebuild one card:

```sh
python3 tools/build_cards.py --only 01-abundance
```

Single-card builds also refresh the contact sheet, gallery and copy audit while leaving the other card exports untouched. The build verifies text against the structured source and checks export dimensions and opacity.

## Current review

The user approved the higher title position and requested it across the whole deck. All chapter titles now use the shared 150 px baseline, and INWARD has been removed from Abundance. All original illustration cutouts were checked for completeness; see `content/art-audit.json` at the repository root. Further design feedback is collected through the Cloudflare website.
