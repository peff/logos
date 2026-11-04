#!/usr/bin/env python3

import argparse
from pathlib import Path
import runpy

from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps


def main():
	parser = argparse.ArgumentParser()
	parser.add_argument("font", help="Noto Sans Egyptian Hieroglyphs font")
	parser.add_argument("output", help="output Egyptian tile WOFF2 font")
	args = parser.parse_args()
	source = TTFont(args.font)
	tiles = runpy.run_path(str(Path(__file__).with_name("generate-tile-font.py")))
	glyphs = {".notdef": tiles["empty_glyph"]()}
	cmap = {}
	# Keep the original line drawings, thickening their strokes in tile
	# coordinates. Independent fitting gives each pictogram room to breathe.
	for symbol in "𓋹𓂀𓆣𓅓𓆗𓀠":
		name = f"egyptian_{ord(symbol):05x}"
		glyphs[name] = tiles["text_glyph"](source, symbol, 760, 780, embolden=6)
		cmap[ord(symbol)] = name

	# Keep the OFL-derived glyphs separate from the Pagella-derived font.
	builder = FontBuilder(1000, isTTF=True)
	builder.setupGlyphOrder(list(glyphs))
	builder.setupCharacterMap(cmap)
	builder.setupGlyf(glyphs)
	for glyph in glyphs.values():
		glyph.recalcBounds(builder.font["glyf"])
	builder.setupHorizontalMetrics({
		name: (1000, getattr(glyph, "xMin", 0)) for name, glyph in glyphs.items()
	})
	builder.setupHorizontalHeader(ascent=800, descent=-200, lineGap=0)
	builder.setupOS2(version=4, sTypoAscender=800, sTypoDescender=-200,
	                 sTypoLineGap=0, usWinAscent=800, usWinDescent=200,
	                 fsSelection=0x80)
	builder.setupNameTable({
		"familyName": "Logos Egyptian",
		"styleName": "Regular",
		"uniqueFontIdentifier": "Logos Egyptian Regular 1.0",
		"fullName": "Logos Egyptian Regular",
		"psName": "LogosEgyptian-Regular",
		"version": "Version 1.0",
		"copyright": source["name"].getDebugName(0),
		"licenseDescription": source["name"].getDebugName(13),
		"licenseInfoURL": source["name"].getDebugName(14),
	})
	builder.setupPost(keepGlyphNames=False)
	builder.setupMaxp()
	builder.setupHead(created=source["head"].created, modified=source["head"].modified)
	# Thickening uses translated copies of each outline. Merge them so
	# rasterizers see a single filled shape rather than overlapping contours.
	removeOverlaps(builder.font)
	builder.font.flavor = "woff2"
	builder.save(args.output)


if __name__ == "__main__":
	main()
