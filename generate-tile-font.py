#!/usr/bin/env python3

import argparse
import math

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


UNITS_PER_EM = 1000
ASCENT = 800
DESCENT = -200
REGULAR_BASE = 0xE000
COMPACT_ROMAN_BASE = 0xE100
CLUE_ARROW = 0xE200

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


def draw_with_extended_right_edge(glyph, pen, old_xmax, new_xmax):
	recording = RecordingPen()
	glyph.draw(recording)
	for operation, points in recording.value:
		points = tuple(
			(new_xmax if x == old_xmax else x, y)
			for x, y in points
		)
		getattr(pen, operation)(*points)


def text_glyph(font, text, max_width=760, max_height=680, tracking=0,
		embolden=0, extend_root=None):
	glyphs = font.getGlyphSet()
	run = glyph_run(font, text, tracking)
	xmin, ymin, xmax, ymax = run_bounds(glyphs, run)
	scale = min(max_width / (xmax - xmin), max_height / (ymax - ymin))
	dx = 500 - scale * (xmin + xmax) / 2
	dy = 500 + scale * (ymin + ymax) / 2

	pen = TTGlyphPen(None)
	quadratic = Cu2QuPen(pen, max_err=0.5, reverse_direction=True)
	offsets = [(0, 0)]
	if embolden:
		offsets += [
			(embolden, 0), (-embolden, 0), (0, embolden), (0, -embolden),
			(embolden * .7, embolden * .7),
			(embolden * .7, -embolden * .7),
			(-embolden * .7, embolden * .7),
			(-embolden * .7, -embolden * .7),
		]
	for ox, oy in offsets:
		for name, x in run:
			transform = (scale, 0, 0, scale,
			             dx + scale * x + ox, ASCENT - dy + oy)
			transformed = TransformPen(quadratic, transform)
			if extend_root is not None:
				new_xmax = (extend_root - dx - embolden) / scale
				draw_with_extended_right_edge(glyphs[name], transformed,
				                              xmax, new_xmax)
			else:
				glyphs[name].draw(transformed)
	return pen.glyph()


def font_point(point):
	x, y = point
	return (x, ASCENT - y)


def add_polygon(pen, points, reverse=False):
	points = list(points)
	if reverse:
		points.reverse()
	pen.moveTo(font_point(points[0]))
	for point in points[1:]:
		pen.lineTo(font_point(point))
	pen.closePath()


def add_circle(pen, cx, cy, radius, reverse=False):
	# Four cubic arcs are converted to quadratic curves by Cu2QuPen.
	k = radius * 0.5522847498
	if reverse:
		pen.moveTo(font_point((cx + radius, cy)))
		pen.curveTo(font_point((cx + radius, cy - k)),
		            font_point((cx + k, cy - radius)),
		            font_point((cx, cy - radius)))
		pen.curveTo(font_point((cx - k, cy - radius)),
		            font_point((cx - radius, cy - k)),
		            font_point((cx - radius, cy)))
		pen.curveTo(font_point((cx - radius, cy + k)),
		            font_point((cx - k, cy + radius)),
		            font_point((cx, cy + radius)))
		pen.curveTo(font_point((cx + k, cy + radius)),
		            font_point((cx + radius, cy + k)),
		            font_point((cx + radius, cy)))
	else:
		pen.moveTo(font_point((cx + radius, cy)))
		pen.curveTo(font_point((cx + radius, cy + k)),
		            font_point((cx + k, cy + radius)),
		            font_point((cx, cy + radius)))
		pen.curveTo(font_point((cx - k, cy + radius)),
		            font_point((cx - radius, cy + k)),
		            font_point((cx - radius, cy)))
		pen.curveTo(font_point((cx - radius, cy - k)),
		            font_point((cx - k, cy - radius)),
		            font_point((cx, cy - radius)))
		pen.curveTo(font_point((cx + k, cy - radius)),
		            font_point((cx + radius, cy - k)),
		            font_point((cx + radius, cy)))
	pen.closePath()


def add_rounded_rect(pen, x0, y0, x1, y1, radius, reverse=False):
	points = [
		(x0 + radius, y0), (x1 - radius, y0),
		(x1, y0), (x1, y0 + radius),
		(x1, y1 - radius), (x1, y1),
		(x1 - radius, y1), (x0 + radius, y1),
		(x0, y1), (x0, y1 - radius),
		(x0, y0 + radius), (x0, y0),
	]
	if reverse:
		# Use the same construction in the opposite direction so it cuts a hole.
		add_rounded_rect_reverse(pen, x0, y0, x1, y1, radius)
		return
	pen.moveTo(font_point(points[0]))
	pen.lineTo(font_point(points[1]))
	pen.qCurveTo(font_point(points[2]), font_point(points[3]))
	pen.lineTo(font_point(points[4]))
	pen.qCurveTo(font_point(points[5]), font_point(points[6]))
	pen.lineTo(font_point(points[7]))
	pen.qCurveTo(font_point(points[8]), font_point(points[9]))
	pen.lineTo(font_point(points[10]))
	pen.qCurveTo(font_point(points[11]), font_point(points[0]))
	pen.closePath()


def add_rounded_rect_reverse(pen, x0, y0, x1, y1, radius):
	pen.moveTo(font_point((x0 + radius, y0)))
	pen.qCurveTo(font_point((x0, y0)), font_point((x0, y0 + radius)))
	pen.lineTo(font_point((x0, y1 - radius)))
	pen.qCurveTo(font_point((x0, y1)), font_point((x0 + radius, y1)))
	pen.lineTo(font_point((x1 - radius, y1)))
	pen.qCurveTo(font_point((x1, y1)), font_point((x1, y1 - radius)))
	pen.lineTo(font_point((x1, y0 + radius)))
	pen.qCurveTo(font_point((x1, y0)), font_point((x1 - radius, y0)))
	pen.lineTo(font_point((x0 + radius, y0)))
	pen.closePath()


def geometry_glyph(draw):
	pen = TTGlyphPen(None)
	quadratic = Cu2QuPen(pen, max_err=0.5, reverse_direction=False)
	draw(quadratic)
	return pen.glyph()


def add_capsule(pen, x0, y0, x1, y1, width):
	dx = x1 - x0
	dy = y1 - y0
	length = math.hypot(dx, dy)
	ox = -dy * width / (2 * length)
	oy = dx * width / (2 * length)
	add_polygon(pen, [(x0 + ox, y0 + oy), (x1 + ox, y1 + oy),
	                  (x1 - ox, y1 - oy), (x0 - ox, y0 - oy)])
	add_circle(pen, x0, y0, width / 2, reverse=True)
	add_circle(pen, x1, y1, width / 2, reverse=True)


def clue_arrow_glyph():
	def draw(pen):
		for x0, y0, x1, y1 in [
			(130, 500, 870, 500),
			(130, 500, 300, 315),
			(130, 500, 300, 685),
			(870, 500, 700, 315),
			(870, 500, 700, 685),
		]:
			add_capsule(pen, x0, y0, x1, y1, 85)
	return geometry_glyph(draw)


def die_glyph(value):
	positions = {
		1: [(500, 500)],
		2: [(330, 330), (670, 670)],
		3: [(330, 330), (500, 500), (670, 670)],
		4: [(330, 330), (670, 330), (330, 670), (670, 670)],
		5: [(330, 330), (670, 330), (500, 500), (330, 670), (670, 670)],
		6: [(330, 330), (670, 330), (330, 500), (670, 500),
		    (330, 670), (670, 670)],
	}
	def draw(pen):
		add_rounded_rect(pen, 157, 157, 843, 843, 47)
		add_rounded_rect(pen, 223, 223, 777, 777, 14, reverse=True)
		for x, y in positions[value]:
			add_circle(pen, x, y, 58)
	return geometry_glyph(draw)


def shape_glyph(index):
	def draw(pen):
		if index == 0:
			add_polygon(pen, [(500, 143), (850, 818), (150, 818)])
			add_polygon(pen, [(500, 286), (741, 752), (259, 752)], reverse=True)
		elif index == 1:
			add_polygon(pen, [(150, 182), (850, 182), (500, 857)])
			add_polygon(pen, [(259, 248), (741, 248), (500, 714)], reverse=True)
		elif index == 2:
			add_polygon(pen, [(172, 172), (828, 172), (828, 828), (172, 828)])
			add_polygon(pen, [(238, 238), (762, 238), (762, 762), (238, 762)],
			            reverse=True)
		elif index == 3:
			add_polygon(pen, [(500, 118), (882, 500), (500, 882), (118, 500)])
			add_polygon(pen, [(500, 212), (788, 500), (500, 788), (212, 500)],
			            reverse=True)
		elif index == 4:
			center = (500, 500)
			points = [(500, 150), (835, 395), (707, 790),
			          (293, 790), (165, 395)]
			for scale, reverse in ((1.105, False), (.895, True)):
				scaled = [(center[0] + (x - center[0]) * scale,
				           center[1] + (y - center[1]) * scale)
				          for x, y in points]
				add_polygon(pen, scaled, reverse=reverse)
		else:
			add_circle(pen, 500, 500, 363)
			add_circle(pen, 500, 500, 297, reverse=True)
	return geometry_glyph(draw)


def empty_glyph():
	return TTGlyphPen(None).glyph()


def main():
	parser = argparse.ArgumentParser()
	parser.add_argument("font", help="TeX Gyre Pagella Bold OpenType font")
	parser.add_argument("output", help="output Logos Tiles WOFF2 font")
	args = parser.parse_args()

	source = TTFont(args.font)
	glyphs = {".notdef": empty_glyph()}
	cmap = {}
	glyph_order = [".notdef"]

	for family in range(6):
		for index in range(6):
			name = f"tile_{family}_{index}"
			codepoint = REGULAR_BASE + family * 6 + index
			if family in TEXT_SYMBOLS:
				text = TEXT_SYMBOLS[family][index]
				width = 1200 if family == 2 else 760
				height = 680
				embolden = 0
				extend_root = None
				if family == 5:
					width *= .9
					height *= .9
				if family == 5 and index == 5:
					width = 850
					height = 780
					embolden = 9
					extend_root = 860
				glyph = text_glyph(source, text, width, height,
				                   embolden=embolden,
				                   extend_root=extend_root)
			elif family == 3:
				glyph = die_glyph(index + 1)
			else:
				glyph = shape_glyph(index)
			glyphs[name] = glyph
			glyph_order.append(name)
			cmap[codepoint] = name

	for index, text in enumerate(TEXT_SYMBOLS[2]):
		name = f"tile_compact_2_{index}"
		codepoint = COMPACT_ROMAN_BASE + index
		glyphs[name] = text_glyph(source, text, 1200, 680, tracking=-120)
		glyph_order.append(name)
		cmap[codepoint] = name

	name = "clue_arrow"
	glyphs[name] = clue_arrow_glyph()
	glyph_order.append(name)
	cmap[CLUE_ARROW] = name

	builder = FontBuilder(UNITS_PER_EM, isTTF=True)
	builder.setupGlyphOrder(glyph_order)
	builder.setupCharacterMap(cmap)
	builder.setupGlyf(glyphs)
	for glyph in glyphs.values():
		glyph.recalcBounds(builder.font["glyf"])
	metrics = {
		name: (UNITS_PER_EM, getattr(glyph, "xMin", 0))
		for name, glyph in glyphs.items()
	}
	builder.setupHorizontalMetrics(metrics)
	builder.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT, lineGap=0)
	builder.setupOS2(
		version=4,
		sTypoAscender=ASCENT,
		sTypoDescender=DESCENT,
		sTypoLineGap=0,
		usWinAscent=ASCENT,
		usWinDescent=-DESCENT,
		fsSelection=0x80,
		sxHeight=500,
		sCapHeight=680,
	)
	builder.setupNameTable({
		"familyName": "Logos Tiles",
		"styleName": "Regular",
		"uniqueFontIdentifier": "Logos Tiles Regular 1.0",
		"fullName": "Logos Tiles Regular",
		"psName": "LogosTiles-Regular",
		"version": "Version 1.0",
		"copyright": "Derived from TeX Gyre Pagella under the GUST Font License",
	})
	builder.setupPost(keepGlyphNames=False)
	builder.setupMaxp()
	builder.setupHead(created=source["head"].created,
	                  modified=source["head"].modified)
	builder.font.flavor = "woff2"
	builder.save(args.output)


if __name__ == "__main__":
	main()
