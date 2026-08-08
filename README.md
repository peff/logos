Logos
=====

Logos is a browser-based logic puzzle inspired by the "Einstein" puzzle
game. The version I have played is made by Flowix Games, but that is
apparently a port of an old DOS game called "Sherlock". Logos takes its
gameplay from the Flowix version, but the code was written from scratch.

Tile font
---------

The tile symbols and adjacency arrow are bundled in `logos-tiles.woff2` so
their appearance and metrics do not depend on the browser or locally
installed fonts. The textual outlines are derived from TeX Gyre Pagella Bold
2.501, available from CTAN at:

  https://tug.ctan.org/fonts/tex-gyre/opentype/texgyrepagella-bold.otf

They are distributed under the GUST Font License in
`GUST-FONT-LICENSE.txt`. The dice, geometric symbols, and adjacency arrow are
original geometry. To regenerate the committed font with FontTools and its
WOFF2 dependencies installed:

  python3 generate-tile-font.py texgyrepagella-bold.otf logos-tiles.woff2
