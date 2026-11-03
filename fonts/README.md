Font credits and licenses
=========================

`Forum-Regular.ttf` is Forum by Denis Masharov, distributed under
the SIL Open Font License 1.1. See [Forum-OFL.txt](Forum-OFL.txt).

`EBGaramond-Italic-subset.woff2` is a subset of EB Garamond Italic
by the EB Garamond Project Authors, distributed under the SIL Open Font
License 1.1. See [EBGaramond-OFL.txt](EBGaramond-OFL.txt).

`logos-tiles.woff2` contains text glyphs derived from TeX Gyre
Pagella Bold 2.501, distributed under the GUST Font License, along with
geometric symbols drawn for Logos. See [GUST-FONT-LICENSE.txt](GUST-FONT-LICENSE.txt).
The source font is available from:
https://tug.ctan.org/fonts/tex-gyre/opentype/texgyrepagella-bold.otf

`logos-egyptian.woff2` contains modified outlines from Noto Sans
Egyptian Hieroglyphs, Copyright 2017 Google Inc., distributed under the
SIL Open Font License 1.1. See [Noto-Egyptian-OFL.txt](Noto-Egyptian-OFL.txt).

Regenerating the fonts
----------------------

Generated fonts are included in the repository; these commands are only
needed when changing them. Run them from the repository root with
FontTools with WOFF2 support installed:

    python3 fonts/generate-tile-font.py texgyrepagella-bold.otf fonts/logos-tiles.woff2
    python3 fonts/generate-egyptian-font.py NotoSansEgyptianHieroglyphs-Regular.ttf fonts/logos-egyptian.woff2
