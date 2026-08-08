Logos
=====

Logos is a browser-based logic puzzle inspired by the "Einstein" puzzle
game. The version I have played is made by Flowix Games, but that is
apparently a port of an old DOS game called "Sherlock". Logos takes its
gameplay from the Flowix version, but the code was written from scratch.

Tile symbols
------------

The textual tile outlines in `tile-symbols.js` are derived from TeX Gyre
Pagella Bold 2.501, available from CTAN at:

  https://tug.ctan.org/fonts/tex-gyre/opentype/texgyrepagella-bold.otf

They are distributed under the GUST Font License in
`GUST-FONT-LICENSE.txt`. The dice and geometric symbols are original SVG
geometry. To regenerate the sprite with FontTools installed:

  python3 generate-tile-symbols.py texgyrepagella-bold.otf tile-symbols.js
