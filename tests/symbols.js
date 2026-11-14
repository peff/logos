import { Logos, assert, makePuzzle } from "./helpers.js";

function clearSettings() {
	localStorage.removeItem("customSymbols");
	localStorage.removeItem("tileSet");
}

function customConfig() {
	const config = Logos.defaultSymbolConfig();
	config.rows[0] = { set: "math", color: "#aabbcc" };
	config.rows[3].set = "halloween";
	[config.rows[0], config.rows[2]] = [config.rows[2], config.rows[0]];
	return config;
}

Deno.test("custom symbol data is validated and detached from the saved object", function() {
	const config = customConfig();
	const copy = Logos.validateSymbolConfig(config);
	assert(copy && copy !== config && copy.rows[0] !== config.rows[0]);
	config.rows[0].color = "#000000";
	assert(copy.rows[0].color != config.rows[0].color);
	const repeated = customConfig();
	repeated.rows[1].set = repeated.rows[0].set;
	assert(Logos.validateSymbolConfig(repeated), "rows cannot independently select the same family");
	for (const change of [
		c => { c.version = 2; },
		c => { c.rows.pop(); },
		c => { c.rows[0].set = "unknown"; },
		c => { c.rows[0].set = "__proto__"; },
		c => { c.rows[0].color = "red; color: black"; },
		c => { c.rows[0].color = ["#abcdef"]; },
		c => { c.rows[0] = null; },
	]) {
		const broken = customConfig();
		change(broken);
		assert(Logos.validateSymbolConfig(broken) === null, "invalid custom data accepted");
	}
});

Deno.test("earlier two-color drafts retain their symbol color", function() {
	const config = customConfig();
	config.rows[0] = { set: "roman", text: "#ABCDEF", frame: "#123456" };
	const converted = Logos.validateSymbolConfig(config);
	assert(converted.rows[0].color == "#abcdef");
	assert(!("text" in converted.rows[0]) && !("frame" in converted.rows[0]));
});

Deno.test("invalid stored custom symbols fall back to Automatic without overwriting storage", function() {
	try {
		localStorage.setItem("tileSet", "custom");
		for (const stored of ["{", "null", '{"version":1,"rows":[]}',
			JSON.stringify({ ...customConfig(), version: 2 })]) {
			localStorage.setItem("customSymbols", stored);
			const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
			assert(puzzle.tileSet == "automatic" && !Object.keys(puzzle.symbolSets).length);
			assert(localStorage.getItem("customSymbols") == stored);
			assert(localStorage.getItem("tileSet") == "custom");
		}
	} finally {
		clearSettings();
	}
});

Deno.test("custom rows and colors persist without changing the puzzle", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	try {
		puzzle.newGame(42);
		const before = JSON.stringify(puzzle.positionSnapshot());
		puzzle.symbolConfigDialog.hidden = false;
		puzzle.symbolDraftName = "Custom";
		puzzle.symbolDraft = customConfig();
		puzzle.symbolConfigDialog.querySelector("#symbol-name").value = "Custom";
		puzzle.commitSymbolName();
		puzzle.saveSymbolDraft();
		puzzle.closeSymbolConfig();
		assert(puzzle.tileSet == "custom:Custom" && puzzle.symbols[0] === Logos.defaultSymbols[2]);
		assert(puzzle.symbols[2] === Logos.symbolRows.math.symbols);
		assert(puzzle.symbols[3][0].label == "Ghost");
		assert(document.body.style["--symbol-row-2-text"] == "#aabbcc");
		assert(JSON.stringify(puzzle.positionSnapshot()) == before);
		const loaded = makePuzzle(6, false, Logos.defaultSymbols);
		assert(loaded.tileSet == "custom:Custom" && loaded.symbols[2] === Logos.symbolRows.math.symbols);
		puzzle.setTileSet("classic");
		assert(puzzle.symbols === Logos.defaultSymbols);
		assert(document.body.style["--symbol-row-2-text"] == "#bea4d1");
		puzzle.setTileSet("custom");
		assert(puzzle.symbols[2] === Logos.symbolRows.math.symbols);
		assert(document.body.style["--symbol-row-2-text"] == "#aabbcc");
		puzzle.newGame(43);
		assert(puzzle.symbols[2] === Logos.symbolRows.math.symbols);
	} finally {
		puzzle.stopTimer();
		clearSettings();
	}
});

Deno.test("opening and closing a copy without edits leaves the saved set alone", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	try {
		puzzle.symbolSets.Custom = customConfig();
		puzzle.setTileSet("custom");
		puzzle.options.hidden = false;
		puzzle.openSymbolConfig();
		assert(puzzle.symbolDraft !== puzzle.symbolSets.Custom);
		const before = JSON.stringify(puzzle.symbolSets.Custom);
		const symbols = puzzle.symbols;
		puzzle.closeSymbolConfig();
		assert(JSON.stringify(puzzle.symbolSets.Custom) == before && puzzle.symbols === symbols);
		assert(puzzle.symbolConfigDialog.hidden && !puzzle.options.hidden && !puzzle.symbolDraft);
	} finally {
		clearSettings();
	}
});

Deno.test("custom symbols refresh active suppositions and survive daily returns", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	try {
		puzzle.newGame(42);
		const slot = puzzle.rows[2].slots.find(slot => !slot.single);
		const wrong = (slot.value + 1) % 6;
		puzzle.enterSuppose();
		puzzle.requestTileAction(slot, wrong, "place");
		const suppose = puzzle.suppose;
		puzzle.symbolSets.Custom = customConfig();
		puzzle.setTileSet("custom");
		assert(puzzle.suppose === suppose && slot.singleElem.textContent == Logos.symbolRows.math.symbols[wrong]);
		puzzle.leaveSuppose(true);
		puzzle.saveDailyReturn();
		puzzle.newGame("20261031", true, true);
		puzzle.setTileSet("classic");
		puzzle.setTileSet("custom");
		assert(puzzle.restoreDailyReturn() && puzzle.symbols[2] === Logos.symbolRows.math.symbols);
	} finally {
		puzzle.stopTimer();
		clearSettings();
	}
});

Deno.test("named sets can be copied, overwritten, deleted, and reloaded", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	const input = puzzle.symbolConfigDialog.querySelector("#symbol-name");
	const open = () => { puzzle.options.hidden = false; puzzle.openSymbolConfig(); };
	try {
		open();
		assert(puzzle.symbolDraftName == null);
		puzzle.duplicateSymbolSet();
		assert(input.value == "Custom");
		puzzle.symbolDraft.rows[0].set = "math";
		puzzle.commitSymbolName();
		puzzle.saveSymbolDraft();
		puzzle.closeSymbolConfig();
		open();
		assert(input.value == "Custom" && puzzle.symbolDraft.rows[0].set == "math");
		puzzle.duplicateSymbolSet();
		input.value = "Custom 1";
		puzzle.symbolDraft.rows[0].set = "shapes";
		puzzle.commitSymbolName();
		puzzle.saveSymbolDraft();
		puzzle.closeSymbolConfig();
		assert(puzzle.symbolSets.Custom.rows[0].set == "math");
		open();
		assert(input.value == "Custom 1");
		input.value = " Custom ";
		puzzle.commitSymbolName();
		puzzle.saveSymbolDraft();
		puzzle.closeSymbolConfig();
		assert(Object.keys(puzzle.symbolSets).length == 1 && puzzle.symbolSets.Custom.rows[0].set == "shapes");
		const loaded = makePuzzle(6, false, Logos.defaultSymbols);
		assert(loaded.tileSet == "custom:Custom" && Object.keys(loaded.symbolSets).length == 1);
		open();
		puzzle.duplicateSymbolSet();
		puzzle.selectSymbolSet("custom:Custom");
		input.value = "Custom 1";
		puzzle.deleteSymbolSet();
		assert(puzzle.tileSet == "custom:Custom");
		assert(!puzzle.symbolConfigDialog.hidden && puzzle.options.hidden);
		puzzle.closeSymbolConfig();
		open();
		input.value = "Custom";
		puzzle.deleteSymbolSet();
		assert(puzzle.tileSet == "automatic" && !Object.keys(puzzle.symbolSets).length);
		puzzle.closeSymbolConfig();
		assert(!Object.keys(makePuzzle(6).symbolSets).length);
	} finally {
		clearSettings();
	}
});

Deno.test("preset definitions supply selection, descriptions, tiles, and editable copies", function() {
	Logos.tileSets.example = {
		name: "Example preset",
		description: "An extra preset for the test.",
		tiles: Logos.defaultSymbols.map((row, i) => i == 0 ? Logos.symbolRows.math.symbols : row),
	};
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	try {
		const option = puzzle.options.querySelector("#tile-set").children.find(option => option.value == "example");
		assert(option.textContent == "Example preset");
		puzzle.setTileSet("example");
		assert(puzzle.symbols === Logos.tileSets.example.tiles);
		puzzle.options.hidden = false;
		puzzle.openSymbolConfig();
		assert(puzzle.symbolDraftName == null && puzzle.symbolDraft.rows[0].set == "math");
		assert(puzzle.symbolConfigDialog.querySelector(".symbol-preset-description").textContent == Logos.tileSets.example.description);
		puzzle.duplicateSymbolSet();
		assert(puzzle.symbolSets.Custom.rows[0].set == "math");
	} finally {
		delete Logos.tileSets.example;
		clearSettings();
	}
});

Deno.test("Automatic previews current reveals and customization preserves seasonal behavior", function() {
	for (const year of [2026, 2027]) {
		for (const day of [25, 26, 30, 31]) {
			const symbols = Logos.symbolsForDate(new Date(year, 9, day));
			const puzzle = makePuzzle(6, false, () => Logos.seasonalMaskForDate(new Date(year, 9, day)));
			try {
				puzzle.options.hidden = false;
				puzzle.openSymbolConfig();
				assert(puzzle.tileSet == "automatic" && puzzle.symbolDraftName == null);
				const list = puzzle.symbolConfigDialog.querySelector(".symbol-config-rows");
				assert(list.querySelectorAll(".symbol-row-select").every(select =>
					select.disabled && select.value != "automatic"));
				assert(list.querySelectorAll(".symbol-row-color").every(input => input.disabled));
				const previews = list.querySelectorAll(".symbol-row-preview");
				for (const [row, preview] of previews.entries())
					for (const [value, tile] of preview.children.entries()) {
						const symbol = symbols[row][value];
						assert(typeof symbol == "string" ? tile.textContent == symbol :
							tile.children[0].src == symbol.src);
					}
				puzzle.closeSymbolConfig();
				assert(puzzle.tileSet == "automatic" && puzzle.symbols.every((row, i) =>
					row.every((symbol, j) => symbol === symbols[i][j])));
				assert(localStorage.getItem("customSymbols") === null);
				puzzle.openSymbolConfig();
				puzzle.duplicateSymbolSet();
				assert(puzzle.tileSet == "custom:Custom");
				assert(JSON.stringify(puzzle.symbolSets.Custom) == JSON.stringify(Logos.defaultSymbolConfig("automatic")));
				assert(puzzle.symbols.every((row, i) => row.every((symbol, j) => symbol === symbols[i][j])));
			} finally {
				clearSettings();
			}
		}
	}
});

Deno.test("hidden seasonal rows do not leak through Automatic customization", function() {
	for (const [month, day, revealed] of [
		[10, 20, 0], [10, 21, 1], [10, 26, 6], [10, 27, 0],
		[10, 30, 0], [11, 1, 1], [11, 6, 6], [11, 7, 1], [11, 12, 6],
		[11, 13, 1], [11, 18, 6], [11, 19, 1], [11, 24, 6], [11, 25, 6], [11, 26, 0],
	]) {
		const puzzle = makePuzzle(6, false, () => Logos.seasonalMaskForDate(new Date(2026, month, day)));
		try {
			puzzle.options.hidden = false;
			puzzle.openSymbolConfig();
			assert(puzzle.symbolDraft.rows[3].set == "dice",
				"hidden seasonal row was exposed in the draft");
			const previews = puzzle.symbolConfigDialog.querySelector(".symbol-config-rows")
				.querySelectorAll(".symbol-row-preview");
			assert(previews[3].children.filter(tile => tile.children.length).length == revealed,
				"preview revealed extra seasonal artwork");
			puzzle.duplicateSymbolSet();
			const list = puzzle.symbolConfigDialog.querySelector(".symbol-config-rows");
			for (const select of list.querySelectorAll(".symbol-row-select"))
				assert(!select.children.some(option => Logos.symbolRows[option.value]?.hidden),
					"hidden artwork is selectable");
		} finally {
			clearSettings();
		}
	}
});

Deno.test("existing custom selections can still use a hidden seasonal row", function() {
	const config = Logos.defaultSymbolConfig();
	config.rows[3].set = "thanksgiving";
	try {
		localStorage.setItem("customSymbols", JSON.stringify({ version: 2,
			sets: [{ name: "Harvest", config }] }));
		localStorage.setItem("tileSet", "custom:Harvest");
		const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
		assert(puzzle.symbols[3] === Logos.symbolRows.thanksgiving.symbols);
		puzzle.options.hidden = false;
		puzzle.openSymbolConfig();
		const selects = puzzle.symbolConfigDialog.querySelector(".symbol-config-rows")
			.querySelectorAll(".symbol-row-select");
		assert(selects[3].value == "thanksgiving" &&
			selects[3].children.some(option => option.value == "thanksgiving"));
		assert(!selects[0].children.some(option => option.value == "thanksgiving"));
	} finally {
		clearSettings();
	}
});

Deno.test("removed holiday presets fall back to Automatic", function() {
	for (const preset of ["halloween", "thanksgiving"]) {
		try {
			localStorage.setItem("tileSet", preset);
			const puzzle = makePuzzle(6, false, () => Logos.seasonalMaskForDate(new Date(2026, 9, 30)));
			assert(puzzle.tileSet == "automatic");
			assert(puzzle.symbols[3].filter(symbol => typeof symbol != "string").length == 5);
			for (const select of [puzzle.options.querySelector("#tile-set"),
				puzzle.symbolConfigDialog.querySelector("#symbol-manager-set")])
				assert(!select.children.some(option => option.value == preset));
		} finally {
			clearSettings();
		}
	}
});

Deno.test("seasonal preferences default off for old custom sets and reject non-booleans", function() {
	const old = customConfig();
	delete old.seasonal;
	assert(Logos.validateSymbolConfig(old).seasonal === false);
	for (const value of [null, "true", 1, [], {}])
		assert(Logos.validateSymbolConfig({ ...old, seasonal: value }) === null);
	for (const value of [true, false])
		assert(Logos.validateSymbolConfig({ ...old, seasonal: value }).seasonal === value);
	try {
		localStorage.setItem("customSymbols", JSON.stringify(old));
		localStorage.setItem("tileSet", "custom");
		const puzzle = makePuzzle(6, false, () => Logos.seasonalMaskForDate(new Date(2026, 10, 26)));
		assert(puzzle.symbolSets.Custom.seasonal === false);
		assert(puzzle.symbols[3] === Logos.symbolRows.halloween.symbols);
	} finally {
		clearSettings();
	}
});

Deno.test("custom seasonal artwork preserves fallback rows and colors and refreshes on settings edits", function() {
	let date = new Date(2026, 9, 30);
	const source = () => Logos.seasonalMaskForDate(date);
	const puzzle = makePuzzle(6, false, source);
	try {
		puzzle.newGame(42);
		const before = JSON.stringify(puzzle.positionSnapshot());
		puzzle.options.hidden = false;
		puzzle.openSymbolConfig();
		assert(puzzle.symbolConfigDialog.querySelector(".symbol-seasonal-row").style.visibility == "hidden");
		puzzle.changeSymbolSeasonal(false);
		assert(puzzle.symbolDraft.seasonal, "read-only preset accepted a seasonal edit");
		puzzle.duplicateSymbolSet();
		puzzle.symbolDraft.rows[0].set = "math";
		puzzle.symbolDraft.rows[3] = { set: "greek", color: "#123456" };
		puzzle.saveSymbolDraft();
		assert(puzzle.symbols[0] === Logos.symbolRows.math.symbols);
		assert(puzzle.symbols[3][4] === Logos.symbolRows.halloween.symbols[4]);
		assert(puzzle.symbols[3][5] === Logos.symbolRows.greek.symbols[5]);
		assert(document.body.style["--symbol-row-3-text"] == "#123456");
		assert(JSON.stringify(puzzle.positionSnapshot()) == before);
		date = new Date(2026, 10, 1);
		puzzle.changeSymbolSeasonal(false);
		assert(puzzle.symbols[3] === Logos.symbolRows.greek.symbols);
		puzzle.changeSymbolSeasonal(true);
		assert(puzzle.symbols[3] === Logos.symbolRows.greek.symbols,
			"editing a set did not refresh seasonal artwork for the current date");
		puzzle.closeSymbolConfig();
		puzzle.newGame(43);
		assert(puzzle.symbols[3] === Logos.symbolRows.greek.symbols);
		date = new Date(2026, 10, 26);
		const loaded = makePuzzle(6, false, source);
		assert(loaded.symbolSets.Custom.seasonal && loaded.tileSet == "custom:Custom");
		assert(loaded.symbols[3].every((tile, i) => tile === Logos.symbolRows.thanksgiving.symbols[i]));
		assert(loaded.symbols[0] === Logos.symbolRows.math.symbols);
		assert(document.body.style["--symbol-row-3-text"] == "#123456");
		puzzle.newGame(44);
		assert(puzzle.symbols[3][5] === Logos.symbolRows.thanksgiving.symbols[5]);
	} finally {
		puzzle.stopTimer();
		clearSettings();
	}
});

Deno.test("settings edits update seasonal artwork for a suspended game", function() {
	let date = new Date(2026, 9, 26);
	const puzzle = makePuzzle(6, false, () => Logos.seasonalMaskForDate(date));
	try {
		puzzle.newGame(42);
		puzzle.saveDailyReturn();
		date = new Date(2026, 9, 31);
		puzzle.newGame("20261031", true, true);
		puzzle.symbolSets.Custom = Logos.defaultSymbolConfig("automatic");
		puzzle.symbolSets.Custom.rows[3].set = "greek";
		puzzle.setTileSet("custom");
		assert(puzzle.symbols[3][5].label == "Jack-o’-lantern");
		assert(puzzle.restoreDailyReturn());
		assert(puzzle.symbols[3][0].label == "Ghost");
		assert(puzzle.symbols[3][5].label == "Jack-o’-lantern");
		date = new Date(2026, 10, 1);
		puzzle.symbolSets.Custom.rows[3].color = "#abcdef";
		puzzle.refreshSymbols();
		assert(puzzle.symbols[3][1] === Logos.symbolRows.greek.symbols[1]);
	} finally {
		puzzle.stopTimer();
		clearSettings();
	}
});

Deno.test("renaming an existing set removes its old name without other edits", function() {
	const puzzle = makePuzzle(6, false, Logos.defaultSymbols);
	try {
		puzzle.symbolSets.Original = customConfig();
		puzzle.setTileSet("custom:Original");
		puzzle.options.hidden = false;
		puzzle.openSymbolConfig();
		const before = JSON.stringify(puzzle.symbolSets.Original);
		puzzle.symbolConfigDialog.querySelector("#symbol-name").value = "Renamed";
		puzzle.closeSymbolConfig();
		assert(Object.keys(puzzle.symbolSets).join() == "Renamed");
		assert(JSON.stringify(puzzle.symbolSets.Renamed) == before);
		const loaded = makePuzzle(6, false, Logos.defaultSymbols);
		assert(loaded.tileSet == "custom:Renamed");
		assert(Object.keys(loaded.symbolSets).join() == "Renamed");
		assert(JSON.stringify(loaded.symbolSets.Renamed) == before);
	} finally {
		clearSettings();
	}
});
