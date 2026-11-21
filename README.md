# A Field Guide for the Newly Rich

A practical and personal guide to money, freedom, and a more expansive life. This repository contains the original illustrations, 21 consistently styled cards, the editable sources, and a Cloudflare slideshow with design feedback.

**[View the live slideshow](https://newly-rich-guide.lalucha.workers.dev)** · **[Leave feedback](https://newly-rich-guide.lalucha.workers.dev/feedback)** · **[Prompt for your GPT/Codex](HANDOFF.md)** · **[See all cards](assets/consistent/contact-sheet.jpg)**

![Abundance as a Mindset — current card](assets/consistent/png/01-abundance.png)

## Start here, design assistant

Give your GPT/Codex the prompt in [HANDOFF.md](HANDOFF.md), along with your design feedback. It explains the design decisions, exact files to change, rendering process, and how to return changes. Coding agents should also read [AGENTS.md](AGENTS.md).

The recommended collaboration flow is:

1. Fork or clone this public repository and create a working branch.
2. Make the requested design changes in the structured sources.
3. Render affected cards, inspect them visually, and preview the website.
4. Send a pull request to this repository. Without GitHub write access, return a patch or the changed files.
5. Fatemeh can review, merge, and redeploy to the existing Cloudflare site. A collaborator can deploy directly only if separately given access to that Cloudflare account.

Reading or cloning this repository does **not** grant access to the Cloudflare account or private feedback database. No credentials are included.

## What has been approved

- Use original image **01 — Abundance as a Mindset** as the visual reference: warm, pale parchment, fine dark border, serif type, restrained red accents, and engraved artwork.
- Reuse a single blank master for every card. Only the empty master was produced with image generation; text, rules, frames, and composition are deterministic SVG.
- Preserve the existing wording and printed numbering. For example, Abundance still says `No. 03`, as in the original. Avoid rewriting, shortening, renumbering, or adding copy during design work.
- Remove `INWARD` from Abundance. All chapter titles use the approved higher baseline of **150 px** on a **1671 × 941** canvas.
- Every illustration comes from its original PNG, with the complete artwork visible. Do not substitute or generate new artwork. [The art audit](content/art-audit.json) records the sources and crop corrections.
- Keep the website as **one complete image per page**, with arrow buttons, keyboard arrows and phone swipes. No navigation menus. The small feedback link and the final feedback page are intentional.

The cover, dedication, and centered privilege quotation keep their special layouts. Phone layouts show the whole landscape card and allow native browser pinch zoom; they do not reflow the text inside the image.

## Where to edit

| File or folder | Purpose |
| --- | --- |
| [`content/cards.json`](content/cards.json) | Source of truth for every card: exact text, geometry, rich text marks, and illustration crops |
| [`assets/consistent/template/style.json`](assets/consistent/template/style.json) | Shared type, colors, margins, title height and number position |
| [`tools/build_cards.py`](tools/build_cards.py) | Wraps text, creates SVGs and PNGs, and refreshes the local review gallery |
| [`assets/consistent/template/blank-card.png`](assets/consistent/template/blank-card.png) | Shared blank paper and outer border; reuse this file unchanged |
| [`assets/originals/`](assets/originals/) | Untouched source PNGs: 21 guide cards and one website reference mockup |
| [`assets/consistent/editable/`](assets/consistent/editable/) | Generated, self-contained SVGs; change the sources and regenerate these |
| [`assets/consistent/png/`](assets/consistent/png/) | Generated PNG exports used to build the website |
| [`site/`](site/) | Slideshow HTML, CSS, JavaScript and asset headers |
| [`server/worker.js`](server/worker.js) | Cloudflare Worker; validates and saves feedback |
| [`tools/build_site.py`](tools/build_site.py) | Builds lossless, content-hashed web images and the slide manifest in `dist/` |
| [`wrangler.jsonc`](wrangler.jsonc) | Existing Cloudflare Worker, asset and database bindings |
| [`deployment.json`](deployment.json) | Live URL and latest recorded deployment identity |

Text supports `[red]…[/red]`, `[i]…[/i]`, and `[b]…[/b]`. Illustration `crop` values are `[x, y, width, height]` in **original-image coordinates**. Destination `x`, `y`, `w`, and `h` position that crop on the new card. A `clip` path may exclude neighboring original text or frames, but must not cut off any part of the subject. The shared ink filter removes the original paper behind the engraving.

## Preview the existing website

Prerequisites: Node.js 24 or newer, Python 3, and Pillow. Previewing the committed cards does not require the card-rendering fonts or a Cloudflare login.

```sh
git clone https://github.com/fatemehmd/newly-rich.git
cd newly-rich
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r tools/requirements.txt
npm ci
npm run build
npm run db:local
npm run dev
```

Open **http://127.0.0.1:8787**. The local feedback database is separate from the live one.

## Render design changes

Card rendering also needs **librsvg** (`rsvg-convert`) and the exact **Times New Roman** regular, italic, bold, and bold italic fonts. On macOS, the renderer uses `/System/Library/Fonts/Supplemental` by default. Install librsvg with `brew install librsvg` if needed.

On another system, point `NEWLY_RICH_FONT_DIR` at your licensed Times New Roman files, named `Times New Roman.ttf`, `Times New Roman Italic.ttf`, `Times New Roman Bold.ttf`, and `Times New Roman Bold Italic.ttf`. The renderer uses this directory for both measurements and SVG rendering. Do not silently substitute another font: it changes wrapping and layout. Font files are not bundled in this repository.

```sh
# Render only the card you changed.
python3 tools/build_cards.py --only 01-abundance

# Render the entire deck after a shared style change.
npm run build:cards

# Refresh the website images after card changes.
npm run build
```

Single-card builds also refresh the contact sheet, copy audit and `assets/consistent/index.html` without rerendering the other cards. Open the resulting PNG at full size and compare its artwork with the original. Check all wrapped lines, bottom margins, callout frames, and the artwork's extremities.

The generated `copy-audit.json` verifies that rendered text matches the structured source. It does not replace proofreading or visual inspection. Web images are lossless WebP exports; every pixel is preserved from the corresponding PNG.

## Validate changes

```sh
npm test

# With npm run dev running; requires Google Chrome.
npm run test:browser
```

The API tests cover saved comments, duplicate retries, validation, privacy, and storage failure. The browser check visits all 21 slides, checks navigation and phone layout, and exercises feedback drafts, failure handling and a real local submission. Screenshots and receipts go into the ignored `test-results/` folder.

Include changed source files and regenerated card outputs in a pull request. Add before/after previews and a short note on what was checked. Keep `dist/`, local feedback, credentials, and temporary files out of Git.

## Deployment — for an authorized maintainer

The site is already deployed to Cloudflare as `newly-rich-guide`, using the separate D1 database `newly-rich-feedback`. Preserve those identities on updates. GitHub pushes and pull requests do **not** automatically deploy.

```sh
# Authenticate to an account with access to the configured Cloudflare resources.
npx wrangler login

# Build and publish the current card exports and site code.
npm run deploy
```

For initial database setup or a schema change only, use `npm run db:remote` before deployment. Routine design edits do not need to recreate or reinitialize the database. After publishing, check the live slide and feedback page, then update `deployment.json` with the returned Cloudflare version and deck revision. Comments survive redeployments because they are stored in D1.

## How feedback is retrieved

The public form accepts comments; it does not publicly list them. Each comment records the slide, deck revision, optional author, timestamp and open/addressed status.

An authorized maintainer can retrieve comments with:

```sh
npm run feedback:pull
```

This uses the maintainer's authenticated Cloudflare account and saves open comments in the ignored `.review/feedback.json`. For a design assistant without that access, Fatemeh can share relevant comments privately, or the assistant can simply give her own design instructions to her GPT/Codex.

After a change is deployed and checked, mark only the exact comments that were addressed:

```sh
npm run feedback:pull -- --resolve deck-REVISION FEEDBACK-UUID
```

Use `npm run feedback:pull -- --all` for history. No background GPT, automatic feedback monitor, GitHub deployment integration, or unattended redeployment is configured.
