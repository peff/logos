#!/usr/bin/env python3

"""Subset Google Fonts' EBGaramond-Italic[wght].ttf for the invitation.

Source: https://github.com/google/fonts/tree/main/ofl/ebgaramond
Requires fontTools and Brotli (pip install 'fonttools[woff]').
Usage: python3 fonts/subset-inscription-font.py INPUT.ttf OUTPUT.woff2
Keep EBGaramond-OFL.txt alongside the generated font.
"""

import argparse

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("font")
	parser.add_argument("output")
	args = parser.parse_args()

	font = TTFont(args.font, recalcTimestamp=False)
	instantiateVariableFont(font, {"wght": 400}, inplace=True)
	options = subset.Options()
	options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
	subsetter = subset.Subsetter(options=options)
	subsetter.populate(text="№ 0123456789abcdef")
	subsetter.subset(font)
	font.flavor = "woff2"
	font.save(args.output)


if __name__ == "__main__":
	main()
