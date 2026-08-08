#!/usr/bin/env python3

import argparse
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


TEXT_SYMBOLS = {
	0: ["1", "2", "3", "4", "5", "6"],
	1: ["A", "B", "C", "D", "E", "F"],
	2: ["I", "II", "III", "IV", "V", "VI"],
	5: ["+", "\u2012", "\u00f7", "x", "=", "\u221a"],
}


def glyph_run(font, text, tracking=0):
	cmap = font.getBestCmap()
	hmtx = font["hmtx"]
	run = []
	x = 0
	for char in text:
		name = cmap[ord(char)]
		run.append((name, x))
		x += hmtx[name][0] + tracking
	return run


def run_bounds(glyphs, run):
	pen = BoundsPen(glyphs)
	for name, x in run:
		glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
	return pen.bounds


def text_symbol(font, text, max_width=760, max_height=680, tracking=0):
	glyphs = font.getGlyphSet()
	run = glyph_run(font, text, tracking)
	xmin, ymin, xmax, ymax = run_bounds(glyphs, run)
	scale = min(max_width / (xmax - xmin), max_height / (ymax - ymin))
	dx = 500 - scale * (xmin + xmax) / 2
	dy = 500 + scale * (ymin + ymax) / 2
	paths = []
	for name, x in run:
		pen = SVGPathPen(glyphs, lambda value: f"{value:.2f}".rstrip("0").rstrip("."))
		transform = (scale, 0, 0, -scale, dx + scale * x, dy)
		glyphs[name].draw(TransformPen(pen, transform))
		paths.append(f'<path d="{pen.getCommands()}"/>')
	return "".join(paths)


def die_symbol(value):
	# Keep the outer pips well inset from the frame; the six looked crowded
	# when its rows were at 300/700 even though they technically fit. The die
	# frame has only a slight radius to split the difference between the
	# square-cornered Unicode glyph and a conspicuously rounded die.
	positions = {
		1: [(500, 500)],
		2: [(330, 330), (670, 670)],
		3: [(330, 330), (500, 500), (670, 670)],
		4: [(330, 330), (670, 330), (330, 670), (670, 670)],
		5: [(330, 330), (670, 330), (500, 500), (330, 670), (670, 670)],
		6: [(330, 330), (670, 330), (330, 500), (670, 500),
		    (330, 670), (670, 670)],
	}
	pips = "".join(f'<circle cx="{x}" cy="{y}" r="58"/>'
	               for x, y in positions[value])
	return ('<rect x="190" y="190" width="620" height="620" rx="14" '
	        'fill="none" stroke="currentColor" stroke-width="66"/>' + pips)


# These do not share literal bounds: their optical sizes are tuned so that
# every outline has comparable visual weight and presence on a tile.
SHAPES = [
	'<path d="M500 180L820 785H180Z"/>',
	'<path d="M180 215H820L500 820Z"/>',
	'<rect x="205" y="205" width="590" height="590"/>',
	'<path d="M500 165L835 500L500 835L165 500Z"/>',
	'<path d="M500 150L835 395L707 790H293L165 395Z"/>',
	'<circle cx="500" cy="500" r="330"/>',
]


def emit_symbol(symbol_id, contents, stroke=False, outline=0):
	attrs = (' fill="none" stroke="currentColor" stroke-width="66" '
	         'stroke-linejoin="round"') if stroke else ' fill="currentColor"'
	if outline:
		attrs += (f' stroke="currentColor" stroke-width="{outline}" '
		          'stroke-linejoin="round"')
	return (f'\t<symbol id="{symbol_id}" viewBox="0 0 1000 1000" '
	        f'overflow="visible"{attrs}>{contents}</symbol>')


def main():
	parser = argparse.ArgumentParser()
	parser.add_argument("font", help="TeX Gyre Pagella Bold OpenType font")
	parser.add_argument("output", help="output JavaScript containing the SVG sprite")
	args = parser.parse_args()

	font = TTFont(args.font)
	lines = [
		'<svg xmlns="http://www.w3.org/2000/svg" style="display:none">',
	]
	for family, symbols in TEXT_SYMBOLS.items():
		for index, text in enumerate(symbols):
			# Large Roman numerals share a cap height. Let longer sequences
			# extend horizontally instead of shrinking their I and V forms;
			# the tile has enough room and the open spacing looks better here.
			width = 1200 if family == 2 else 760
			height = 680
			outline = 0
			if family == 5 and index == 5:
				# Pagella's radical is noticeably smaller and lighter than the
				# other math tiles. Enlarge and outline it, then add a separate
				# top bar below. The font's bar ended near x=700; extending it to
				# x=860 gives the radical the long overbar we could not get from
				# the original font-rendered character.
				width = 850
				height = 780
				outline = 18
			contents = text_symbol(font, text, width, height)
			if family == 5 and index == 5:
				contents += '<path d="M700 110H860V170H700Z"/>'
			lines.append(emit_symbol(f"tile-{family}-{index}",
			                         contents,
			                         outline=outline))
	# The 2x3 candidate grid has much less horizontal room. Tighten the Roman
	# tracking there so III, IV, and VI fit at the same cap height; a little
	# contact between adjacent serifs reads naturally, almost like a ligature.
	for index, text in enumerate(TEXT_SYMBOLS[2]):
		lines.append(emit_symbol(f"tile-compact-2-{index}",
		                         text_symbol(font, text, 1200, 680,
		                                     tracking=-120)))
	for index in range(6):
		lines.append(emit_symbol(f"tile-3-{index}", die_symbol(index + 1)))
	for index, shape in enumerate(SHAPES):
		lines.append(emit_symbol(f"tile-4-{index}", shape, stroke=True))
	lines.append('</svg>')

	javascript = ["var tileSymbolDefinitions ="]
	for index, line in enumerate(lines):
		suffix = ";" if index == len(lines) - 1 else " +"
		javascript.append(f"\t'{line}'{suffix}")
	javascript.extend([
		"",
		"function installTileSymbols() {",
		'\tdocument.body.insertAdjacentHTML("afterbegin", tileSymbolDefinitions);',
		"}",
	])
	with open(args.output, "w", encoding="utf-8") as output:
		output.write("\n".join(javascript) + "\n")


if __name__ == "__main__":
	main()
