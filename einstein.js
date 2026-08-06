var defaultSymbols = [
	["1", "2", "3", "4", "5", "6"],
	["A", "B", "C", "D", "E", "F"],
	["I", "II", "III", "IV", "V", "VI"],
	// unicode dice
	["&#x2680;", "&#x2681;", "&#x2682;", "&#x2683;", "&#x2684;", "&#x2685;"],
	// unicode shapes
	["&#x25b3;", "&#x25bd;", "<span class=\"heavy-outline\">&#x25a1;</span>",
	 "&#x25c7;", "&#x2b20;", "<span class=\"circle-symbol\">&#x25cb;</span>"],
	["+", "&#x2012;", "&#x00f7;", "x", "=", "√"]
];

var showActiveClues = true;

document.addEventListener('contextmenu', function(ev) {
	ev.preventDefault();
});

function Puzzle(board, hClues, vClues, messages, symbols) {
	symbols = symbols || defaultSymbols;

	this.messages = messages;
	this.rows = [];
	this.hClueSlots = [];
	this.vClueSlots = [];
	for (var i = 0; i < symbols.length; i++)
		this.rows[i] = new Row(this, symbols[i], board.insertRow(), i);
	for (var i = 0; i < 6; i++) {
		var row = hClues.insertRow();
		for (var j = 0; j < 3; j++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.hClueSlots.push(cell);
		}
	}
	{
		var row = vClues.insertRow();
		for (var i = 0; i < 8; i++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.vClueSlots.push(cell);
		}
	}

	this.clear = function() {
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].clear();
		this.say("Einstein Puzzle");
	}

	this.newGame = function() {
		for (var i = 0; i < this.rows.length; i++)
			this.rows[i].newGame();
		this.generateClues();
		this.say("Good luck!");
	}

	this.checkWin = function() {
		for (var i = 0; i < this.rows.length; i++)
			if (!this.rows[i].isComplete())
				return;
		this.say("You win!");
	}

	this.say = function(msg) {
		this.messages.innerHTML = msg;
	}

	this.generateClues = function() {
		this.clues = [];
		var types = [ExactClue, OrderClue, Adjacent2Clue,
			     Adjacent3Clue, ColumnClue];
		do {
			while (!this.sufficientClues()) {
				var type = weightedChoice(types);
				var clue = new type(this);
				this.clues.push(clue);
				clue.active = true;
			}

			for (var i = this.clues.length - 1; i >= 0; i--) {
				var without = this.clues.slice();
				without.splice(i, 1);
				if (cluesSolve(this, without))
					this.clues = without;
			}

			this.clues = limitDisplayedClues(this.clues,
				"horizontal", this.hClueSlots.length);
			this.clues = limitDisplayedClues(this.clues,
				"vertical", this.vClueSlots.length);
		} while (!this.sufficientClues());

		for (var i = 0; i < this.hClueSlots.length; i++) {
			this.hClueSlots[i].innerHTML = "";
			this.hClueSlots[i].oncontextmenu = null;
		}
		for (var i = 0; i < this.vClueSlots.length; i++) {
			this.vClueSlots[i].innerHTML = "";
			this.vClueSlots[i].oncontextmenu = null;
		}

		this.numHClues = 0;
		this.numVClues = 0;
		for (var i = 0; i < this.clues.length; i++) {
			var clue = this.clues[i];
			if (clue.displayType == "horizontal")
				clue.display = this.getHClueSlot();
			else if (clue.displayType == "vertical")
				clue.display = this.getVClueSlot();
			checkClueDisplay(clue);
		}
	}

	this.sufficientClues = function() {
		return cluesSolve(this, this.clues);
	}

	this.getHClueSlot = function() { return this.hClueSlots[this.numHClues++]; }
	this.getVClueSlot = function() { return this.vClueSlots[this.numVClues++]; }

	this.toggleClues = function() {
		showActiveClues = !showActiveClues;
		for (var i = 0; i < this.clues.length; i++)
			checkClueDisplay(this.clues[i]);
	}

	this.clear();
}

function limitDisplayedClues(clues, displayType, limit) {
	var count = 0;
	return clues.filter(function(clue) {
		if (clue.displayType != displayType)
			return true;
		return count++ < limit;
	});
}

// Generate a random integer in the interval [lo, hi).
function randInt(lo, hi) {
	return lo + Math.floor(Math.random() * (hi - lo));
}

function weightedChoice(choices) {
	var total = 0;
	for (var i = 0; i < choices.length; i++)
		total += choices[i].weight;

	var value = Math.random() * total;
	for (var i = 0; i < choices.length; i++) {
		value -= choices[i].weight;
		if (value < 0)
			return choices[i];
	}
}

function shuffle(array) {
	for (var i = array.length - 1; i >= 0; i--) {
		var r = Math.floor(Math.random() * (i+1));
		var tmp = array[i];
		array[i] = array[r];
		array[r] = tmp;
	}
	return array;
}

/* Try to solve the puzzle using only deductions from the given clues. */
function cluesSolve(puzzle, clues) {
	var numRows = puzzle.rows.length;
	var rowSize = puzzle.rows[0].slots.length;
	var fullDomain = (1 << rowSize) - 1;
	var domains = [];

	for (var row = 0; row < numRows; row++) {
		domains[row] = [];
		for (var symbol = 0; symbol < rowSize; symbol++)
			domains[row][symbol] = fullDomain;
	}

	var changed;
	do {
		changed = false;

		/* Each column contains exactly one symbol from each row. */
		for (var row = 0; row < numRows; row++) {
			var singles = 0;
			for (var symbol = 0; symbol < rowSize; symbol++) {
				var domain = domains[row][symbol];
				if (!domain)
					return false;
				if ((domain & (domain - 1)) == 0) {
					if (singles & domain)
						return false;
					singles |= domain;
				}
			}
			for (var symbol = 0; symbol < rowSize; symbol++) {
				var domain = domains[row][symbol];
				if ((domain & (domain - 1)) != 0) {
					var reduced = domain & ~singles;
					if (reduced != domain) {
						domains[row][symbol] = reduced;
						changed = true;
					}
				}
			}

			/* A column which has only one candidate fixes that symbol. */
			for (var col = 0; col < rowSize; col++) {
				var bit = 1 << col;
				var candidate = -1;
				for (var symbol = 0; symbol < rowSize; symbol++) {
					if (domains[row][symbol] & bit) {
						if (candidate >= 0) {
							candidate = -2;
							break;
						}
						candidate = symbol;
					}
				}
				if (candidate == -1)
					return false;
				if (candidate >= 0 && domains[row][candidate] != bit) {
					domains[row][candidate] = bit;
					changed = true;
				}
			}
		}

		for (var i = 0; i < clues.length; i++) {
			if (clues[i].constrain(domains, fullDomain))
				changed = true;
		}
	} while (changed);

	for (var row = 0; row < numRows; row++) {
		for (var symbol = 0; symbol < rowSize; symbol++) {
			var domain = domains[row][symbol];
			if (!domain || (domain & (domain - 1)) != 0)
				return false;
		}
	}
	return true;
}

function clueVariable(domains, row, slot) {
	var rowNum = row.puzzle.rows.indexOf(row);
	return {
		domains: domains[rowNum],
		symbol: slot.value
	};
}

function restrictVariable(variable, allowed) {
	var old = variable.domains[variable.symbol];
	variable.domains[variable.symbol] &= allowed;
	return old != variable.domains[variable.symbol];
}

function Row(puzzle, symbols, display, family) {
	this.puzzle = puzzle;
	this.familyClass = "family-" + family;
	this.slots = [];
	for (var i = 0; i < symbols.length; i++)
		this.slots[i] = new Slot(this, symbols, display.insertCell());

	this.clear = function() {
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].displaySingle(i);
	}

	this.newGame = function() {
		var values = [];
		for (var i = 0; i < this.slots.length; i++)
			values.push(i);
		shuffle(values);
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].newGame(values[i]);
	}

	this.removePossible = function(value) {
		for (var i = 0; i < this.slots.length; i++)
			this.slots[i].removePossible(value)
	}

	this.checkSingleton = function(value) {
		var possible = this.slots.filter(
			function(slot) { return slot.isPossible(value) });
		if (possible.length == 1)
			possible[0].choose(value);
	}

	this.isComplete = function() {
		for (var i = 0; i < this.slots.length; i++)
			if (!this.slots[i].single)
				return false;
		return true;
	}
}

function Slot(row, symbols, display) {
	this.row = row;
	this.symbols = symbols;
	this.elem = display;
	this.elem.className = "slot " + row.familyClass;

	this.say = function(msg) { this.row.puzzle.say(msg) };

	this.newGame = function(value) {
		this.value = value;
		this.possible = [];
		for (var i = 0; i < this.symbols.length; i++)
			this.possible.push(true);
		this.displayPossible();
	}

	this.symbol = function() {
		return this.symbols[this.value];
	}

	this.displaySingle = function(i) {
		var tile = document.createElement("div");
		tile.className = "single";
		tile.innerHTML = this.symbols[i];
		this.elem.innerHTML = '';
		this.elem.appendChild(tile);
		this.single = true;
	}

	this.displayPossible = function() {
		// as close to square as we can
		var table = document.createElement("table");
		var rows = Math.floor(Math.sqrt(this.symbols.length));
		var cols = Math.floor(this.symbols.length / rows);
		for (var i = 0; i < rows; i++) {
			var row = table.insertRow();
			var lo = i * cols;
			var hi = (i+1) * cols;
			if (hi > this.symbols.length)
				hi = this.symbols.length;
			for (var j = lo; j < hi; j++) {
				var cell = this.displayPossible[j] = row.insertCell();
				cell.innerHTML = this.symbols[j];
				cell.className = "possibility";
				cell.addEventListener('click',
					function(s, j) { return function() {
						s.choose(j);
					}}(this, j));
				cell.addEventListener('contextmenu',
					function(s, j) { return function(ev) {
						ev.preventDefault();
						s.discard(j);
					}}(this, j));
			}
		}

		this.elem.innerHTML = "";
		this.elem.appendChild(table);
		this.single = false;
	}

	this.choose = function(value) {
		if (this.value == value) {
			this.displaySingle(value);
			this.row.removePossible(value);
			this.row.puzzle.checkWin();
		} else {
			this.say("Nope, not " + this.symbols[value]);
		}
	}

	this.discard = function(value) {
		if (this.single)
			return;
		if (this.value == value) {
			this.say("Oops, it was " + this.symbols[value]);
		} else {
			this.removePossible(value);
			this.row.checkSingleton(value);
		}
	}

	this.isPossible = function(value) {
		return !this.single && this.possible[value];
	}

	this.removePossible = function(value) {
		this.possible[value] = false;
		this.displayPossible[value].innerHTML = "";
		this.displayPossible[value].className = "dead-possibility";
		this.checkSingleton();
	}

	this.checkSingleton = function() {
		if (this.single)
			return;
		var count = 0;
		var last;
		for (var i = 0; i < this.possible.length; i++) {
			if (this.possible[i]) {
				count++;
				last = i;
			}
		}
		if (count == 1)
			this.choose(last);
	}
}

function checkClueDisplay(clue) {
	if (clue.active == showActiveClues)
		clue.show();
	else if (clue.display)
		clue.display.innerHTML = "";
}

function displayClue(clue, slot, type, elements) {
	slot.innerHTML = "";
	for (var i = 0; i < elements.length; i++) {
		var elem = document.createElement(type);
		elem.className = elements[i][0];
		elem.innerHTML = elements[i][1];
		slot.appendChild(elem);
	}
	if (!clue.listener) {
		clue.listener = function(ev) {
			ev.preventDefault();
			clue.active = !clue.active;
			checkClueDisplay(clue);
		};
	}
	slot.oncontextmenu = clue.listener;
}

function OrderClue(puzzle) {
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lCol = randInt(0, this.lRow.slots.length - 1);
	this.rCol = randInt(this.lCol + 1, this.rRow.slots.length);
	this.displayType = "horizontal";

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = 0;
		var rightAllowed = 0;
		for (var l = 0; l < this.lRow.slots.length; l++) {
			for (var r = l + 1; r < this.rRow.slots.length; r++) {
				if (leftDomain & (1 << l) && rightDomain & (1 << r)) {
					leftAllowed |= 1 << l;
					rightAllowed |= 1 << r;
				}
			}
		}
		return restrictVariable(left, leftAllowed) |
			restrictVariable(right, rightAllowed);
	}

	this.show = function() {
		displayClue(this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["dots", "..."],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		]);
	}
}
OrderClue.weight = 5;

function Adjacent2Clue(puzzle) {
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lCol = randInt(0, this.lRow.slots.length - 1);
	this.rCol = this.lCol + 1;
	this.displayType = "horizontal";

	if (Math.random() < 0.5) {
		var tmp = this.lCol;
		this.lCol = this.rCol;
		this.rCol = tmp;
	}

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = (rightDomain << 1) | (rightDomain >> 1);
		var rightAllowed = (leftDomain << 1) | (leftDomain >> 1);
		return restrictVariable(left, leftAllowed & fullDomain) |
			restrictVariable(right, rightAllowed & fullDomain);
	}

	this.show = function() {
		displayClue(this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["arrow", "&#x2194;"],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		]);
	}
}
Adjacent2Clue.weight = 5;

function Adjacent3Clue(puzzle) {
	this.mRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.mCol = randInt(1, this.mRow.slots.length - 1);
	this.lCol = this.mCol - 1;
	this.rCol = this.mCol + 1;
	this.displayType = "horizontal";

	if (Math.random() < 0.5) {
		var tmp = this.lCol;
		this.lCol = this.rCol;
		this.rCol = tmp;
	}

	this.constrain = function(domains, fullDomain) {
		var left = clueVariable(domains, this.lRow,
					this.lRow.slots[this.lCol]);
		var middle = clueVariable(domains, this.mRow,
					  this.mRow.slots[this.mCol]);
		var right = clueVariable(domains, this.rRow,
					 this.rRow.slots[this.rCol]);
		var leftDomain = left.domains[left.symbol];
		var middleDomain = middle.domains[middle.symbol];
		var rightDomain = right.domains[right.symbol];
		var leftAllowed = 0;
		var middleAllowed = 0;
		var rightAllowed = 0;
		for (var m = 1; m < this.mRow.slots.length - 1; m++) {
			for (var direction = -1; direction <= 1; direction += 2) {
				var l = m + direction;
				var r = m - direction;
				if (leftDomain & (1 << l) &&
				    middleDomain & (1 << m) &&
				    rightDomain & (1 << r)) {
					leftAllowed |= 1 << l;
					middleAllowed |= 1 << m;
					rightAllowed |= 1 << r;
				}
			}
		}
		var changed = restrictVariable(left, leftAllowed);
		changed |= restrictVariable(middle, middleAllowed);
		changed |= restrictVariable(right, rightAllowed);
		return changed;
	}

	this.show = function() {
		displayClue(this, this.display, "span", [
			    ["tile " + this.lRow.familyClass,
			     this.lRow.slots[this.lCol].symbol()],
			    ["tile " + this.mRow.familyClass,
			     this.mRow.slots[this.mCol].symbol()],
			    ["tile " + this.rRow.familyClass,
			     this.rRow.slots[this.rCol].symbol()]
		]);
	}
}
Adjacent3Clue.weight = 5;

function ColumnClue(puzzle) {
	this.tRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.col = randInt(0, this.tRow.slots.length);
	this.bRow = this.tRow;
	while (this.bRow == this.tRow)
		this.bRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.displayType = "vertical";

	this.constrain = function(domains, fullDomain) {
		var top = clueVariable(domains, this.tRow,
				       this.tRow.slots[this.col]);
		var bottom = clueVariable(domains, this.bRow,
					  this.bRow.slots[this.col]);
		var common = top.domains[top.symbol] &
			bottom.domains[bottom.symbol];
		return restrictVariable(top, common) |
			restrictVariable(bottom, common);
	}

	this.show = function() {
		displayClue(this, this.display, "div", [
			    ["tile " + this.tRow.familyClass,
			     this.tRow.slots[this.col].symbol()],
			    ["tile " + this.bRow.familyClass,
			     this.bRow.slots[this.col].symbol()]
		]);
	}
}
ColumnClue.weight = 5;

function ExactClue(puzzle) {
	this.row = puzzle.rows[randInt(0, puzzle.rows.length)];
	this.slot = this.row.slots[randInt(0, this.row.slots.length)];

	this.constrain = function(domains, fullDomain) {
		var variable = clueVariable(domains, this.row, this.slot);
		var pos = this.row.slots.indexOf(this.slot);
		return restrictVariable(variable, 1 << pos);
	}

	this.show = function() {
		this.slot.choose(this.slot.value);
	}
}
ExactClue.weight = 1;
