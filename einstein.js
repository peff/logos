var defaultSymbols = [
	["1", "2", "3", "4", "5", "6"],
	["A", "B", "C", "D", "E", "F"],
	["I", "II", "III", "IV", "V", "VI"],
	// unicode dice
	["&#x2680;", "&#x2681;", "&#x2682;", "&#x2683;", "&#x2684;", "&#x2685;"],
	// unicode shapes
	["&#x25b3;", "&#x25bd;", "&#x25a1;", "&#x25c7;", "&#x2b20;", "&#x25cb;"],
	["+", "&#x2012;", "&#x00f7;", "x", "=", "√"]
];

function Puzzle(board, hClues, vClues, messages, symbols) {
	symbols = symbols || defaultSymbols;

	this.messages = messages;
	this.rows = [];
	this.hClueSlots = [];
	this.vClueSlots = [];
	for (var i = 0; i < symbols.length; i++)
		this.rows[i] = new Row(this, symbols[i], board.insertRow());
	for (var i = 0; i < 8; i++) {
		var row = hClues.insertRow();
		for (var j = 0; j < 3; j++) {
			var cell = row.insertCell();
			cell.className = "clue";
			this.hClueSlots.push(cell);
		}
	}
	{
		var row = vClues.insertRow();
		for (var i = 0; i < 15; i++) {
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
		this.numHClues = 0;
		this.numVClues = 0;
		while (!this.sufficientClues() &&
		       this.numHClues < this.hClueSlots.length &&
		       this.numVClues < this.vClueSlots.length) {
			var type = Math.random();
			var clue =
				type < 0.2 ? new OrderClue(this) :
				type < 0.4 ? new Adjacent2Clue(this) :
				type < 0.6 ? new Adjacent3Clue(this) :
				type < 0.8 ? new ColumnClue(this) :
				             new ExactClue(this);
			this.clues.push(clue);
		}
	}

	this.sufficientClues = function() {
		// XXX try to solve
		return false;
	}

	this.getHClueSlot = function() { return this.hClueSlots[this.numHClues++]; }
	this.getVClueSlot = function() { return this.vClueSlots[this.numVClues++]; }

	this.clear();
}

// Generate a random integer in the interval [lo, hi).
function randInt(lo, hi) {
	return lo + Math.floor(Math.random() * (hi - lo));
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

function Row(puzzle, symbols, display) {
	this.puzzle = puzzle;
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
			this.slots[i].discard(value);
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
	this.elem.className = "slot";

	this.say = function(msg) this.row.puzzle.say(msg);

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
			this.possible[value] = false;
			this.displayPossible[value].innerHTML = "";
			this.displayPossible[value].className = "dead-possibility";
			this.checkSingleton();
			this.row.checkSingleton(value);
		}
	}

	this.isPossible = function(value) {
		return !this.single && this.possible[value];
	}

	this.checkSingleton = function() {
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

function displayClue(slot, type, elements) {
	slot.innerHTML = "";
	for (var i = 0; i < elements.length; i++) {
		var elem = document.createElement(type);
		elem.className = elements[i][0];
		elem.innerHTML = elements[i][1];
		slot.appendChild(elem);
	}
}

function OrderClue(puzzle) {
	var lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	var rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	var lCol = randInt(0, lRow.slots.length - 1);
	var rCol = randInt(lCol + 1, rRow.slots.length);

	displayClue(puzzle.getHClueSlot(), "span", [
	      ["tile", lRow.slots[lCol].symbol()],
	      ["dots", "..."],
	      ["tile", rRow.slots[rCol].symbol()]
	]);
}

function Adjacent2Clue(puzzle) {
	var lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	var rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	var lCol = randInt(0, lRow.slots.length - 1);
	var rCol = lCol + 1;

	if (Math.random() < 0.5) {
		var tmp = lCol;
		lCol = rCol;
		rCol = tmp;
	}

	displayClue(puzzle.getHClueSlot(), "span", [
	      ["tile", lRow.slots[lCol].symbol()],
	      ["arrow", "&#x2194;"],
	      ["tile", rRow.slots[rCol].symbol()]
	]);
}

function Adjacent3Clue(puzzle) {
	var mRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	var lRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	var rRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	var mCol = randInt(1, mRow.slots.length - 1);
	var lCol = mCol - 1;
	var rCol = mCol + 1;

	if (Math.random() < 0.5) {
		var tmp = lCol;
		lCol = rCol;
		rCol = tmp;
	}

	displayClue(puzzle.getHClueSlot(), "span", [
	      ["tile", lRow.slots[lCol].symbol()],
	      ["tile", mRow.slots[mCol].symbol()],
	      ["tile", rRow.slots[rCol].symbol()]
	]);
}

function ColumnClue(puzzle) {
	var tRow = puzzle.rows[randInt(0, puzzle.rows.length)];
	var col = randInt(0, tRow.slots.length);
	var bRow = tRow;
	while (bRow == tRow)
		bRow = puzzle.rows[randInt(0, puzzle.rows.length)];

	displayClue(puzzle.getVClueSlot(), "div", [
	      ["tile", tRow.slots[col].symbol()],
	      ["tile", bRow.slots[col].symbol()]
	]);
}

function ExactClue(puzzle) {
	var row = puzzle.rows[randInt(0, puzzle.rows.length)];
	var slot = row.slots[randInt(0, row.slots.length)];
	slot.choose(slot.value);
}
