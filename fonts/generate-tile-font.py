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
NUMBER_SYMBOLS = "123456"
CAPITAL_SYMBOLS = "ABCDEF"
MATH_SYMBOLS = "+−÷x="
GREEK_SYMBOLS = "αθλπψΩ"
LOWERCASE_SYMBOLS = "knrstz"
ARROW_SYMBOLS = "↖↑↗↙↓↘"

CHESS_SYMBOLS = "♚♛♜♝♞♟"
SKY_SYMBOLS = "☀☽☁⚡❄🌬"
DICE_BASE = 0x2680
SHAPE_CODEPOINTS = [0x25B3, 0x25BD, 0x25A1, 0x25C7, 0x2B20, 0x25CB]
CLUE_ARROW = 0x2194
BECAUSE = 0x2235


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


def shared_text_scale(font, symbols, max_width=760, max_height=680):
	glyphs = font.getGlyphSet()
	bounds = [run_bounds(glyphs, glyph_run(font, text)) for text in symbols]
	return min(
		min(max_width / (xmax - xmin), max_height / (ymax - ymin))
		for xmin, ymin, xmax, ymax in bounds
	)


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
		embolden=0, extend_root=None, scale=None, baseline=None, height_scale=1):
	glyphs = font.getGlyphSet()
	run = glyph_run(font, text, tracking)
	xmin, ymin, xmax, ymax = run_bounds(glyphs, run)
	if scale is None:
		scale = min(max_width / (xmax - xmin), max_height / (ymax - ymin))
	dx = 500 - scale * (xmin + xmax) / 2
	dy = (500 + scale * height_scale * (ymin + ymax) / 2
	      if baseline is None else ASCENT - baseline)

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
			transform = (scale, 0, 0, scale * height_scale,
			             dx + scale * x + ox, ASCENT - dy + oy)
			transformed = TransformPen(quadratic, transform)
			if extend_root is not None:
				new_xmax = (extend_root - dx - embolden) / scale
				draw_with_extended_right_edge(glyphs[name], transformed,
				                              xmax, new_xmax)
			else:
				glyphs[name].draw(transformed)
	return pen.glyph()


def roman_glyph(font, text):
	glyphs = font.getGlyphSet()
	run = glyph_run(font, text)
	xmin, ymin, xmax, ymax = run_bounds(glyphs, run)
	scale = 680 / (ymax - ymin)
	dy = 500 + scale * (ymin + ymax) / 2

	pen = TTGlyphPen(None)
	quadratic = Cu2QuPen(pen, max_err=0.5, reverse_direction=True)
	transform = (scale, 0, 0, scale, 0, ASCENT - dy)
	glyphs[run[0][0]].draw(TransformPen(quadratic, transform))
	advance = font["hmtx"][run[0][0]][0] * scale
	return pen.glyph(), advance


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


def because_glyph():
	def draw(pen):
		for cx, cy in [(265, 250), (735, 250), (500, 700)]:
			add_polygon(pen, [
				(cx - 80, cy - 80), (cx + 80, cy - 80),
				(cx + 80, cy + 80), (cx - 80, cy + 80),
			])
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


def chess_glyph(piece):
	def draw(pen):
		# A common plinth ties the silhouettes together. Leave a small gap
		# above it so the base does not merge with the body at small sizes.
		add_polygon(pen, [(270, 790), (730, 790), (770, 870), (230, 870)])
		if piece == "♚":
			# The cross is deliberately broad enough for possibility tiles.
			add_polygon(pen, [
				(450, 120), (550, 120), (550, 210), (640, 210),
				(640, 300), (550, 300), (550, 385), (710, 385),
				(650, 505), (575, 540), (575, 620), (690, 745),
				(310, 745), (425, 620), (425, 540), (350, 505),
				(290, 385), (450, 385), (450, 300), (360, 300),
				(360, 210), (450, 210),
			])
		elif piece == "♛":
			add_polygon(pen, [
				(220, 230), (385, 350), (500, 135), (615, 350),
				(780, 230), (675, 510), (580, 550), (580, 625),
				(690, 745), (310, 745), (420, 625), (420, 550),
				(325, 510),
			])
		elif piece == "♜":
			add_polygon(pen, [
				(250, 200), (370, 200), (370, 300), (440, 300),
				(440, 200), (560, 200), (560, 300), (630, 300),
				(630, 200), (750, 200), (750, 420), (630, 485),
				(630, 650), (700, 745), (300, 745), (370, 650),
				(370, 485), (250, 420),
			])
		elif piece == "♝":
			# Cut the mitre diagonally from the edge, avoiding a tiny detail.
			add_polygon(pen, [
				(500, 120), (590, 235), (440, 395), (505, 450),
				(650, 300), (705, 425), (665, 510), (570, 570),
				(570, 625), (690, 745), (310, 745), (430, 625),
				(430, 570), (335, 510), (295, 425), (340, 305),
			])
		elif piece == "♞":
			# A left-facing horse, with a long muzzle and a generous eye.
			add_polygon(pen, [
				(455, 145), (535, 230), (625, 245), (710, 355),
				(745, 535), (700, 745), (300, 745), (345, 620),
				(500, 440), (400, 475), (300, 535), (210, 465),
				(260, 365), (395, 255),
			])
			add_circle(pen, 440, 335, 38, reverse=True)
		elif piece == "♟":
			add_circle(pen, 500, 310, 155)
			add_polygon(pen, [
				(410, 455), (590, 455), (555, 580), (590, 655),
				(690, 745), (310, 745), (410, 655), (445, 580),
			])
	return geometry_glyph(draw)


def add_stroke(pen, points, width):
	# Outline a polyline so curved gusts need no font stroke support.
	left, right = [], []
	for i, (x, y) in enumerate(points):
		before = points[max(0, i - 1)]
		after = points[min(len(points) - 1, i + 1)]
		dx, dy = after[0] - before[0], after[1] - before[1]
		length = math.hypot(dx, dy)
		ox, oy = -dy * width / (2 * length), dx * width / (2 * length)
		left.append((x + ox, y + oy))
		right.append((x - ox, y - oy))
	add_polygon(pen, right + left[::-1])


def sky_glyph(symbol):
	def draw(pen):
		if symbol == "☀":
			add_circle(pen, 500, 500, 205)
			for i in range(8):
				angle = i * math.pi / 4
				def point(radius, offset):
					return (500 + radius * math.cos(angle) - offset * math.sin(angle),
					        500 + radius * math.sin(angle) + offset * math.cos(angle))
				add_polygon(pen, [point(285, -42), point(400, -42),
				                  point(400, 42), point(285, 42)])
		elif symbol == "☽":
			pen.moveTo(font_point((635, 120)))
			pen.curveTo(font_point((160, 90)), font_point((95, 710)), font_point((435, 855)))
			pen.curveTo(font_point((665, 950)), font_point((875, 755)), font_point((875, 565)))
			pen.curveTo(font_point((695, 785)), font_point((380, 625)), font_point((405, 390)))
			pen.curveTo(font_point((415, 260)), font_point((505, 160)), font_point((635, 120)))
			pen.closePath()
		elif symbol == "☁":
			pen.moveTo(font_point((250, 735)))
			pen.curveTo(font_point((70, 735)), font_point((55, 475)), font_point((260, 470)))
			pen.curveTo(font_point((245, 210)), font_point((650, 155)), font_point((695, 445)))
			pen.curveTo(font_point((900, 380)), font_point((1010, 735)), font_point((790, 735)))
			pen.closePath()
		elif symbol == "⚡":
			add_polygon(pen, [(540, 110), (800, 110), (565, 430),
			                  (785, 430), (260, 900), (410, 555), (205, 555)])
		elif symbol == "❄":
			for i in range(6):
				angle = i * math.pi / 3 - math.pi / 2
				def point(radius, offset=0):
					return (500 + radius * math.cos(angle) - offset * math.sin(angle),
					        500 + radius * math.sin(angle) + offset * math.cos(angle))
				add_stroke(pen, [point(0), point(385)], 65)
				for side in [-1, 1]:
					add_stroke(pen, [point(225), point(315, side * 105)], 60)
		elif symbol == "🌬":
			for start, end, y, radius, direction in [
				(140, 620, 340, 100, -1),
				(100, 780, 510, 85, 1),
				(220, 530, 685, 70, 1),
			]:
				center_y = y + direction * radius
				points = [(start, y)]
				for step in range(31):
					angle = -direction * math.pi / 2 + direction * step * math.pi / 20
					points.append((end + radius * math.cos(angle),
					               center_y + radius * math.sin(angle)))
				add_stroke(pen, points, 65)
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

	# Shared scales preserve stroke weights within each group. Independent
	# fitting would enlarge narrow letters and the shorter diagonal arrows.
	for family in (
		NUMBER_SYMBOLS, CAPITAL_SYMBOLS, MATH_SYMBOLS,
		GREEK_SYMBOLS, LOWERCASE_SYMBOLS, ARROW_SYMBOLS,
	):
		scale = shared_text_scale(source, family)
		baseline = None
		if family == GREEK_SYMBOLS:
			# Enlarge the Greek row without changing its relative sizes.
			scale *= 1.35
		elif family == LOWERCASE_SYMBOLS:
			scale *= 1.10
			# Center the group's full vertical extent on a common baseline.
			bounds = [run_bounds(source.getGlyphSet(), glyph_run(source, text))
			          for text in family]
			bottom = min(box[1] for box in bounds)
			top = max(box[3] for box in bounds)
			baseline = ASCENT - 500 - scale * (bottom + top) / 2

		for text in family:
			name = f"text_{ord(text):04x}"
			# Give the minus a little more weight: 110 units, between the
			# shared-scale figure dash (94) and its old fitted size (124).
			height_scale = 7 / 6 if text == "−" else 1
			glyphs[name] = text_glyph(source, text, scale=scale, baseline=baseline,
			                          height_scale=height_scale)
			glyph_order.append(name)
			cmap[ord(text)] = name

	# The root needs a larger, heavier outline and longer bar.
	name = "square_root"
	glyphs[name] = text_glyph(source, "√", 850, 780,
	                          embolden=9, extend_root=860)
	glyph_order.append(name)
	cmap[ord("√")] = name

	for value in range(1, 7):
		name = f"die_{value}"
		glyphs[name] = die_glyph(value)
		glyph_order.append(name)
		cmap[DICE_BASE + value - 1] = name

	for index, codepoint in enumerate(SHAPE_CODEPOINTS):
		name = f"shape_{codepoint:04x}"
		glyphs[name] = shape_glyph(index)
		glyph_order.append(name)
		cmap[codepoint] = name

	for piece in CHESS_SYMBOLS:
		name = f"chess_{ord(piece):04x}"
		glyphs[name] = chess_glyph(piece)
		glyph_order.append(name)
		cmap[ord(piece)] = name

	for symbol in SKY_SYMBOLS:
		name = f"sky_{ord(symbol):04x}"
		glyphs[name] = sky_glyph(symbol)
		glyph_order.append(name)
		cmap[ord(symbol)] = name

	roman_advances = {}
	for text in ["I", "V"]:
		name = f"roman_{text}"
		glyphs[name], roman_advances[name] = roman_glyph(source, text)
		glyph_order.append(name)
		cmap[ord(text)] = name

	name = "clue_arrow"
	glyphs[name] = clue_arrow_glyph()
	glyph_order.append(name)
	cmap[CLUE_ARROW] = name

	name = "because"
	glyphs[name] = because_glyph()
	glyph_order.append(name)
	cmap[BECAUSE] = name

	builder = FontBuilder(UNITS_PER_EM, isTTF=True)
	builder.setupGlyphOrder(glyph_order)
	builder.setupCharacterMap(cmap)
	builder.setupGlyf(glyphs)
	for glyph in glyphs.values():
		glyph.recalcBounds(builder.font["glyf"])
	metrics = {
		name: (roman_advances.get(name, UNITS_PER_EM),
		       getattr(glyph, "xMin", 0))
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
