# Markdown Converter — Brand Assets

Visual identity for [markdown-converter](https://github.com/amitwh/markdown-converter): a cross-platform Markdown editor & document converter powered by Pandoc.

## Concept

The mark is a stylized **M** whose right descender becomes a downward chevron — a literal "**M↓**" for **Markdown**, suggesting the source document flowing downward into rendered output (PDF, DOCX, PPTX, …).

The palette is a vibrant orange-to-deep-orange gradient (`#FB923C → #C2410C`) on a white mark — warm, energetic, distinctive. The mark itself is **white** on light surfaces, and a luminous peach-to-orange gradient (`#FFEDD5 → #FB923C`) on dark surfaces.

## Files

### App icon (vector, primary)

These are **true SVG app icons** — clean vector paths, no rasters. Drop them straight into a macOS/Windows/Linux app bundle, a PWA manifest, an iOS asset catalog, an Electron build, or any HTML page.

| File | Use it for |
| --- | --- |
| `app-icon.svg` | **Primary app icon.** Emerald→teal vertical gradient, subtle white highlight upper-left, white M↓ mark. |
| `app-icon-dark.svg` | **Dark-mode app icon.** Charcoal gradient background, soft teal radial glow upper-left, mint-to-emerald gradient on the M↓ mark. |
| `app-icon-flat.svg` | **Flat solid variant.** Single emerald background, white M↓ mark. Use when you can't render gradients (print, stickers, single-color contexts). |

### Logo (wordmark)

| File | Use it for |
| --- | --- |
| `logo-horizontal.jpg` (2752×1536) | High-res raster master. README hero, press kit. |
| `logo-horizontal-1600w.jpg` (1600×893) | Web-ready compressed version. |
| `logo-horizontal.svg` | Vector wordmark. Use in HTML, CSS, anywhere that needs to scale. |

### Vector mark (for code & inline use)

| File | Use it for |
| --- | --- |
| `mark.svg` | Gradient SVG mark. Drop into HTML, use as a UI element, or rasterize at any size. |
| `mark-mono.svg` | Monochrome SVG. Uses `currentColor` — style it from CSS (`color: white;`) for any single-color context. |
| `mark-standalone.jpg` (2048×2048) | Raster M↓ on white, for places that need a PNG (GitHub avatar, doc thumbnails). |

### Favicons (rasterized from `app-icon.svg`)

In the `favicons/` directory:

| File | Use it for |
| --- | --- |
| `favicon.ico` | Legacy `.ico` (16/32/48/64 embedded). Drop at the site root. |
| `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png` | Standard browser favicons. |
| `apple-touch-icon.png` (180×180) | iOS home screen & "Add to Home Screen". |
| `icon-192.png`, `icon-512.png` | Android home screen, PWA manifest, web app. |

### Social preview

| File | Use it for |
| --- | --- |
| `og-social-preview-1200x630.jpg` | **GitHub social preview** — set as the repository's social card image (Settings → Social preview). Also works as Open Graph / Twitter Card. |

## Usage in the repo

Drop the vector icons + favicon set into the repo root or a `/brand` folder, then in `README.md`:

```markdown
<p align="left">
  <img src="./brand/app-icon.svg" width="80" alt="Markdown Converter">
</p>
```

For the favicon, in `index.html` (or any HTML site):

```html
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
```

For an Electron app, point `build.icon` at the SVG (or a 512×512 PNG export):

```json
{
  "build": {
    "icon": "brand/icon-512.png"
  }
}
```

## Color tokens

```
--mc-orange-400: #FB923C   /* gradient start (light) */
--mc-orange-700: #C2410C   /* gradient end   (light) */
--mc-orange-500: #F97316   /* flat / accent        */
--mc-peach-100:  #FFEDD5   /* dark-mode mark start */
--mc-orange-300: #FDBA74   /* dark-mode mark mid   */
--mc-ink-900:    #0F172A   /* primary text         */
--mc-ink-500:    #475569   /* secondary text       */
--mc-ink-400:    #94A3B8   /* tagline / muted      */
```
