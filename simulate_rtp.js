// simulate_rtp.js
// Monte Carlo RTP estimator replicating pay-anywhere logic from index.html

const args = process.argv.slice(2);
const spins = Number(args[0]) || 100000;

// CONFIG (match index.html)
const members = [];
for (let i = 1; i <= 12; i++) members.push({ name: `User${i}` });

const SCATTER = { name: 'SCATTER', isScatter: true };
const WILD = { name: 'WILD', isWild: true };
const MULT = { name: 'MULT', isMultiplier: true };

// MULT possible values (picked randomly when MULT is placed)
const MULT_VALUES = [2,3,4,5,10,25,50];

const ROWS = 5, COLS = 6, TOTAL_SLOTS = ROWS * COLS;
const TOTAL_LINES = 0; // pay-anywhere
const SCATTER_PAYOUT = { 3: 5, 4: 15, 5: 30 };

const SYMBOL_PAYOUTS = {
  User1: {3:4.00, 4:8.00, 5:50.00},
  User2: {3:1.20,4:3.00,5:10.00},
  User3: {3:1.20,4:3.00,5:10.00},
  User4: {3:0.80,4:1.50,5:6.00},
  User5: {3:0.80,4:1.50,5:6.00},
  User6: {3:0.50,4:0.80,5:3.00},
  User7: {3:0.50,4:0.80,5:3.00},
  User8: {3:0.50,4:0.80,5:3.00},
  User9: {3:0.50,4:0.80,5:3.00},
  User10:{3:0.50,4:0.80,5:3.00},
  User11:{3:0.40,4:0.70,5:2.50},
  User12:{3:0.40,4:0.70,5:2.50}
};
const FREE_SPIN_TRIGGER = 4;
const FREE_SPIN_AWARDS = {3:10,4:20,5:50};
const MULT_VALUE = 2;

// weights: match index.html tuning
const WEIGHTED = [];
members.forEach(m=>WEIGHTED.push({symbol:m, weight:5}));
WEIGHTED.push({symbol:SCATTER, weight:1});
WEIGHTED.push({symbol:WILD, weight:6});
WEIGHTED.push({symbol:MULT, weight:1});
const TOTAL_WEIGHT = WEIGHTED.reduce((s,e)=>s+e.weight,0);

function randomSymbol() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const e of WEIGHTED) {
    if (r < e.weight) return e.symbol;
    r -= e.weight;
  }
  return WEIGHTED[0].symbol;
}

function randomFinalSymbols() {
  const final = [];
  for (let i=0;i<TOTAL_SLOTS;i++) {
    const col = i % COLS;
    let symbol;
    while (true) {
      symbol = randomSymbol();
      if (symbol.isWild && (col === 0 || col === COLS-1)) continue;
      break;
    }
    // clone and, in case of MULT, assign a random multiplier value
    if (symbol.isMultiplier) {
      final.push({ name: 'MULT', isMultiplier: true, value: MULT_VALUES[Math.floor(Math.random()*MULT_VALUES.length)] });
    } else if (symbol.isWild) {
      final.push({ name: 'WILD', isWild: true });
    } else if (symbol.isScatter) {
      final.push({ name: 'SCATTER', isScatter: true });
    } else {
      final.push({ name: symbol.name });
    }
  }
  return final;
}

function computeWinsAndIndices(board, currentBetPerLine) {
  // board: array of symbol objects length TOTAL_SLOTS
  const wins = [];
  const counts = new Map();
  const wildIndices = [];
  // collect indices
  board.forEach((sym, idx) => {
    if (sym && sym.isScatter) return;
    if (sym && sym.isMultiplier) return;
    if (!sym) return;
    if (sym.isWild) { wildIndices.push(idx); return; }
    const name = sym.name;
    if (!counts.has(name)) counts.set(name, []);
    counts.get(name).push(idx);
  });

  // prepare entries sorted by 5-pay (prefer big symbols)
  const entries = [];
  counts.forEach((indices, name) => {
    const max5 = (SYMBOL_PAYOUTS[name] && SYMBOL_PAYOUTS[name][5]) || 0;
    entries.push({ name, indices });
  });
  entries.sort((a,b)=>((SYMBOL_PAYOUTS[b.name] && SYMBOL_PAYOUTS[b.name][5])||0) - ((SYMBOL_PAYOUTS[a.name] && SYMBOL_PAYOUTS[a.name][5])||0));

  let availableWilds = wildIndices.slice();
  for (const e of entries) {
    const natural = e.indices.length;
    const effective = Math.min(natural + availableWilds.length, 5);
    if (effective < 3) continue;
    const pk = effective >=5 ? 5 : effective;
    const basePayout = (SYMBOL_PAYOUTS[e.name] && SYMBOL_PAYOUTS[e.name][pk]) || 0;
    if (basePayout <= 0) continue;
    // choose natural indices first, then wild indices
    const useNatural = Math.min(e.indices.length, pk);
    const used = e.indices.slice(0, useNatural);
    const needWild = pk - useNatural;
    const usedWild = availableWilds.splice(0, needWild);
    const indicesUsed = used.concat(usedWild);
    wins.push({ symbol: e.name, count: pk, indices: indicesUsed, basePayout });
  }

  return { wins, wildIndices };
}

function applyTumble(board) {
  // board is array length TOTAL_SLOTS; for each column, shift down and fill from top with nulls
  for (let c=0;c<COLS;c++) {
    const colIdxs = [];
    for (let r=0;r<ROWS;r++) colIdxs.push(r*COLS + c);
    const colVals = colIdxs.map(i=>board[i]).filter(v=>v!=null);
    const missing = ROWS - colVals.length;
    const newCol = Array(missing).fill(null).concat(colVals);
    for (let i=0;i<colIdxs.length;i++) board[colIdxs[i]] = newCol[i];
  }
}

function evaluatePayout(resultSymbols, currentBetPerLine, currentLines) {
  let totalWinBase = 0;
  const baseTotalBet = currentBetPerLine * currentLines;

  // scatter
  let scatterCount = 0;
  resultSymbols.forEach(sym => { if (sym.isScatter) scatterCount++; });

    // collect natural counts and wild count
    const counts = new Map();
    let wildCount = 0;
    resultSymbols.forEach((sym) => {
      if (sym.isScatter || sym.isMultiplier) return;
      if (sym.isWild) { wildCount += 1; return; }
      counts.set(sym.name, (counts.get(sym.name) || 0) + 1);
    });

    // prepare symbols sorted by their high payout (prefer giving wilds to big symbols)
    const entries = [];
    counts.forEach((cnt, name) => {
      const max5 = (SYMBOL_PAYOUTS[name] && SYMBOL_PAYOUTS[name][5]) || 0;
      entries.push({ name, natural: cnt, max5 });
    });
    entries.sort((a,b)=>b.max5 - a.max5);

    const multCount = resultSymbols.filter(s => s.isMultiplier).length;
    const symMult = multCount > 0 ? Math.pow(MULT_VALUE, multCount) : 1;

    for (const e of entries) {
      const natural = e.natural;
      const effective = Math.min(natural + wildCount, 5);
      if (effective < 3) continue;
      const pk = effective >= 5 ? 5 : effective;
      const basePayout = (SYMBOL_PAYOUTS[e.name] && SYMBOL_PAYOUTS[e.name][pk]) || 0;
      if (basePayout > 0) {
        const wildsUsed = Math.max(0, pk - natural);
        wildCount -= wildsUsed;
        totalWinBase += basePayout * symMult * currentBetPerLine;
      }
    }

  if (scatterCount >= FREE_SPIN_TRIGGER) {
    const key = scatterCount >=5 ? 5 : scatterCount;
    const scatterMult = SCATTER_PAYOUT[key] || 0;
    if (scatterMult>0) totalWinBase += scatterMult * baseTotalBet;
  }

  let wildMultiplierSum = 0;
  resultSymbols.forEach((s) => { if (s.isWild) wildMultiplierSum += 1 + Math.floor(Math.random()*3); });
  const wildMultiplier = wildMultiplierSum > 0 ? wildMultiplierSum : 1;

  return totalWinBase * wildMultiplier;
}

function run(spins, betPerLine=1.0, lines=30) {
  let totalBet = 0;
  let totalWin = 0;
  let totalSymbolWin = 0;
  let totalScatterWin = 0;
  let totalWildMultiplierApplied = 0;

  // safeguard: cap additional free spins per run to avoid runaway
  const MAX_ADDITIONAL_FREE = Math.max(10000, Math.floor(spins * 2));

  for (let base = 0; base < spins; base++) {
    // each base spin increases totalBet
    totalBet += betPerLine * lines;

    // process base spin and its awarded free spins inline
    let freeQueue = 0;
    let loopCount = 0;

    // process the base spin first
    do {
      // generate initial board for this spin/iteration
      let board = randomFinalSymbols();
      let spinMultiplierSum = 0;
      board.forEach(s => { if (s && s.isMultiplier) spinMultiplierSum += s.value || 0; });
      let spinTotalBaseWin = 0;

      // tumble iterations for this spin
      while (true) {
        const { wins } = computeWinsAndIndices(board, betPerLine);
        if (!wins || wins.length === 0) break;
        for (const w of wins) {
          spinTotalBaseWin += w.basePayout * betPerLine;
          w.indices.forEach(i => board[i] = null);
        }
        applyTumble(board);
        for (let i=0;i<TOTAL_SLOTS;i++) {
          if (board[i] == null) {
            const sym = randomSymbol();
            if (sym.isMultiplier) {
              const val = MULT_VALUES[Math.floor(Math.random()*MULT_VALUES.length)];
              board[i] = { name: 'MULT', isMultiplier:true, value: val };
              spinMultiplierSum += val;
            } else if (sym.isWild) board[i] = { name: 'WILD', isWild:true };
            else if (sym.isScatter) board[i] = { name: 'SCATTER', isScatter:true };
            else board[i] = { name: sym.name };
          }
        }
      }

      // compute scatter on final board
      let scatterCount = 0;
      board.forEach(s => { if (s && s.isScatter) scatterCount++; });
      let scatterWin = 0;
      if (scatterCount >= FREE_SPIN_TRIGGER) {
        const key = scatterCount >= 5 ? 5 : scatterCount;
        const scatterMult = SCATTER_PAYOUT[key] || 0;
        if (scatterMult > 0) scatterWin = scatterMult * (betPerLine * lines);
        const awarded = FREE_SPIN_AWARDS[key] || 0;
        freeQueue += awarded;
        if (freeQueue > MAX_ADDITIONAL_FREE) freeQueue = MAX_ADDITIONAL_FREE;
      }

      // cap spin multiplier to avoid extreme explosion during tuning
      const spinMultiplier = Math.min(100, (spinMultiplierSum > 0 ? spinMultiplierSum : 1));
      const totalSpinWin = (spinTotalBaseWin + scatterWin) * spinMultiplier;

      totalWin += totalSpinWin;
      totalSymbolWin += spinTotalBaseWin;
      totalScatterWin += scatterWin;
      totalWildMultiplierApplied += spinMultiplier;

      // If we have free spins to process, enter bonus mode: process them sequentially
      if (freeQueue > 0) {
        // start bonus global multiplier
        let globalMultiplier = 1;
        // cap globalMultiplier to avoid explosion
        const GLOBAL_MULT_CAP = 1000;
        while (freeQueue > 0) {
          freeQueue--;
          // free spin: no bet charged
          // generate board
          let fboard = randomFinalSymbols();
          let fspinMultiplierSum = 0;
          fboard.forEach(s => { if (s && s.isMultiplier) fspinMultiplierSum += s.value || 0; });
          let fspinTotalBaseWin = 0;

          while (true) {
            const { wins } = computeWinsAndIndices(fboard, betPerLine);
            if (!wins || wins.length === 0) break;
            for (const w of wins) {
              fspinTotalBaseWin += w.basePayout * betPerLine;
              w.indices.forEach(i => fboard[i] = null);
            }
            applyTumble(fboard);
            for (let i=0;i<TOTAL_SLOTS;i++) {
              if (fboard[i] == null) {
                const sym = randomSymbol();
                if (sym.isMultiplier) {
                  const val = MULT_VALUES[Math.floor(Math.random()*MULT_VALUES.length)];
                  fboard[i] = { name: 'MULT', isMultiplier:true, value: val };
                  fspinMultiplierSum += val;
                } else if (sym.isWild) fboard[i] = { name: 'WILD', isWild:true };
                else if (sym.isScatter) fboard[i] = { name: 'SCATTER', isScatter:true };
                else fboard[i] = { name: sym.name };
              }
            }
          }

          // compute scatter in free spin; if more scatters, add more freeQueue
          let fscatterCount = 0;
          fboard.forEach(s => { if (s && s.isScatter) fscatterCount++; });
          let fscatterWin = 0;
          if (fscatterCount >= FREE_SPIN_TRIGGER) {
            const key = fscatterCount >= 5 ? 5 : fscatterCount;
            const scatterMult = SCATTER_PAYOUT[key] || 0;
            if (scatterMult > 0) fscatterWin = scatterMult * (betPerLine * lines);
            const awarded = FREE_SPIN_AWARDS[key] || 0;
            freeQueue += awarded;
            if (freeQueue > MAX_ADDITIONAL_FREE) freeQueue = MAX_ADDITIONAL_FREE;
          }

          // update global multiplier: add this free spin's MULT sum
          globalMultiplier = Math.min(GLOBAL_MULT_CAP, globalMultiplier + fspinMultiplierSum);

          const fspinMultiplier = Math.min(100, (fspinMultiplierSum > 0 ? fspinMultiplierSum : 1));
          const ftotalSpinWin = (fspinTotalBaseWin + fscatterWin) * fspinMultiplier * globalMultiplier;

          totalWin += ftotalSpinWin;
          totalSymbolWin += fspinTotalBaseWin;
          totalScatterWin += fscatterWin;
          totalWildMultiplierApplied += fspinMultiplier;
        }
      }

      loopCount++;
    } while (freeQueue > 0 && loopCount < MAX_ADDITIONAL_FREE);
  }

  return { totalBet, totalWin, rtp: totalWin/totalBet, totalSymbolWin, totalScatterWin, totalWildMultiplierApplied };
}

console.log(`Running ${spins} spins...`);
const start = Date.now();
const res = run(spins, 1.0, 30);
const ms = (Date.now()-start);
console.log(`Total bet: ${res.totalBet.toFixed(2)}`);
console.log(`Total win: ${res.totalWin.toFixed(2)}`);
console.log(`RTP: ${(res.rtp*100).toFixed(4)}%`);
console.log(`Time: ${ms} ms`);
 
