# Source Code Availability (GPL / LGPL Written Offer)

MarkdownConverter distributes the following binaries built from GPL-licensed
software. Per GPL §3(b), this document is the written offer: **corresponding
source code for the exact versions listed below is available on request for
at least three years from each release**, and permanently at the referenced
public locations. Write to: amit.wh@gmail.com (or open a GitHub issue at
https://github.com/amitwh/markdown-converter/issues).

## Pandoc — GPL-2.0-or-later

- Binary shipped: `bin/pandoc` (v3.9.0.2, official upstream release, unmodified)
- SHA-256 (linux): `7d124235998ecd3cdd9a463b1e5f6691a178b6461824c29a36170a0882f05597`
- Source: <https://github.com/jgm/pandoc/archive/refs/tags/3.9.0.2.tar.gz>
- Pandoc statically links Haskell libraries (GHC ecosystem, mostly BSD-3);
  their sources are included in the upstream release tarball's dependency set.

## FFmpeg — GPL-3.0-or-later (build configuration)

- Binary shipped: `ffmpeg` provided by the npm package `ffmpeg-static@5.3.0`
  (Linux: johnvansickle.com build; Windows: gyan.dev; macOS: evermeet.cx —
  all `--enable-gpl` builds including x264/x265, per the build banner)
- Source:
  - FFmpeg: <https://ffmpeg.org/releases/> (use the release matching
    `ffmpeg -version` of the shipped binary)
  - Build scripts & pinned versions: <https://github.com/eugeneware/ffmpeg-static>
  - x264: <https://code.videolan.org/videolan/x264> ·
    x265: <https://bitbucket.org/multicoreware/x265_git/> ·
    other `--enable-lib*` components: their upstream sources (all free/open)

## PyInstaller bootloader (inside the bundled MarkItDown binary) — GPL-2.0 with boot-exception

- Binary shipped: `bin/markitdown` (MarkItDown 0.1.7 frozen with PyInstaller 6.x)
- PyInstaller grants a special exception allowing the bootloader to be
  embedded in non-GPL frozen applications; source anyway:
  <https://github.com/pyinstaller/pyinstaller>
- Everything frozen above the bootloader (markitdown + Python packages +
  CPython runtime) is permissively licensed (MIT/Apache/BSD/PSF/MPL);
  see THIRD-PARTY-NOTICES.md §2 for the list.
- CPython runtime source: <https://www.python.org/downloads/source/>
  (PSF License — not GPL, listed here for completeness).

## libvips (via sharp prebuilt binaries) — LGPL-2.1-or-later

- Shipped as dynamically-loaded libraries from `@img/*` prebuilts for sharp 0.35.4
- Source: <https://github.com/libvips/libvips> · prebuilt bundle sources:
  <https://github.com/lovell/sharp-builds>
- LGPL compliance: the app's own source is public (MIT) and the libraries
  remain separately replaceable files in the installation directory
  (`node_modules/@img/`), satisfying the relinking requirement.

---

_Versions and hashes above correspond to the release this file ships with;
update them when bumping bundled tool versions._
