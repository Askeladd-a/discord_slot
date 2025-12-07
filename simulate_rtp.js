// simulate_rtp.js
// Monte Carlo RTP estimator replicating logic from index.html

const args = process.argv.slice(2);
const spins = Number(args[0]) || 100000;

// CONFIG (match index.html)
const members = [];
for (let i = 1; i <= 10; i++) members.push({ name: `User${i}` });

const SCATTER = { name: 'SCATTER', isScatter: true };
const WILD = { name: 'WILD', isWild: true };
const MULT = { name: 'MULT', isMultiplier: true };

const ROWS = 3, COLS = 5, TOTAL_SLOTS = ROWS * COLS;

const PAYLINES = [
  { name: 'Linea 1 (centrale)', slots: [5,6,7,8,9] },
  { name: 'Linea 2 (alta)', slots: [0,1,2,3,4] },
  { name: 'Linea 3 (bassa)', slots: [10,11,12,13,14] },
  { name: 'Linea 4 (diag ↘)', slots: [0,6,12,8,4] },
  { name: 'Linea 5 (diag ↗)', slots: [10,6,2,8,14] },
  { name: 'Linea 6 (zigzag alto)', slots: [0,6,7,8,4] },
  { name: 'Linea 7 (zigzag basso)', slots: [10,6,7,8,14] },
  { name: 'Linea 8 (M)', slots: [5,1,7,13,9] },
  { name: 'Linea 9 (M inversa)', slots: [5,11,7,3,9] },
  { name: 'Linea 10 (W)', slots: [0,11,2,13,4] }
];

const TOTAL_LINES = PAYLINES.length;
const SCATTER_PAYOUT = { 3:5, 4:15, 5:30 };

const SYMBOL_PAYOUTS = {
  User1: {3:4.00, 4:8.00, 5:50.00},
  User2: {3:1.20, 4:3.00, 5:10.00},
  User3: {3:1.20, 4:3.00, 5:10.00},
  User4: {3:0.80, 4:1.50, 5:6.00},
  User5: {3:0.80, 4:1.50, 5:6.00},
  User6: {3:0.50, 4:0.80, 5:3.00},
  User7: {3:0.50, 4:0.80, 5:3.00},
  User8: {3:0.50, 4:0.80, 5:3.00},
  User9: {3:0.50, 4:0.80, 5:3.00},
  User10:{3:0.50, 4:0.80, 5:3.00}
};
const FREE_SPIN_TRIGGER = 3;
const FREE_SPIN_AWARDS = {3:10,4:20,5:50};
const MULT_VALUE = 2;

// weights: each member weight 5, scatter 1, wild 2, mult 1
const WEIGHTED = [];
members.forEach(m=>WEIGHTED.push({symbol:m, weight:5}));
WEIGHTED.push({symbol:SCATTER, weight:1});
WEIGHTED.push({symbol:WILD, weight:2});
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

function evaluatePayout(resultSymbols, currentBetPerLine, currentLines) {
  let totalWinBase = 0;
  const baseTotalBet = currentBetPerLine * currentLines;

  // scatter
  let scatterCount = 0;
  resultSymbols.forEach(sym => { if (sym.isScatter) scatterCount++; });

  for (let li=0; li<currentLines; li++) {
    const line = PAYLINES[li];
    const indices = line.slots;
    const lineSyms = indices.map(i => resultSymbols[i]);

    const multSlots = indices.filter(i => resultSymbols[i].isMultiplier);
    const multCount = multSlots.length;
    const lineMultiplier = multCount>0 ? Math.pow(MULT_VALUE, multCount) : 1;

    const candidates = [WILD, ...members];
    let bestLineWin = 0;

    candidates.forEach(cand => {
      const isCandWild = !!cand.isWild;
      let count = 0;
      for (let pos=0; pos<indices.length; pos++) {
        const sym = lineSyms[pos];
        if (sym.isScatter || sym.isMultiplier) break;
        if (!isCandWild) {
          if (!(sym.name === cand.name || sym.isWild)) break;
        } else {
          if (!sym.isWild) break;
        }
        count++;
      }
      if (count>=3) {
        let basePayout = 0;
        if (isCandWild) {
          basePayout = SYMBOL_PAYOUTS['User1'] ? SYMBOL_PAYOUTS['User1'][count] || 0 : 0;
        } else {
          basePayout = (SYMBOL_PAYOUTS[cand.name] && SYMBOL_PAYOUTS[cand.name][count]) || 0;
        }
        if (basePayout>0) {
          const lineWin = basePayout * lineMultiplier;
          if (lineWin > bestLineWin) bestLineWin = lineWin;
        }
      }
    });

    if (bestLineWin>0) totalWinBase += bestLineWin;
  }

  if (scatterCount >= FREE_SPIN_TRIGGER) {
    const key = scatterCount >=5 ? 5 : scatterCount;
    const scatterMult = SCATTER_PAYOUT[key] || 0;
    if (scatterMult>0) totalWinBase += scatterMult * baseTotalBet;
  }

  return totalWinBase;
}

function randomFinalSymbols() {
  const final = [];
  for (let i=0;i<TOTAL_SLOTS;i++) {
    // ensure wild only on reels 2..4 (cols 1..3)
    const col = i % COLS;
    let symbol;
    // simple approach: try random until wild allowed or pick non-wild
    while (true) {
      symbol = randomSymbol();
      if (symbol.isWild && (col === 0 || col === COLS-1)) continue;
      break;
    }
    final.push(symbol);
  }
  return final;
}

function run(spins, betPerLine=1.0, lines=TOTAL_LINES) {
  let totalBet = 0;
  let totalWin = 0;
  const queue = spins; // base spins to simulate
  let processed = 0;
  // we'll simulate `spins` base spins and include free spins generated
  let i = 0;
  const stack = [];
  for (i=0;i<spins;i++) stack.push({ type: 'base' });

  while (stack.length) {
    stack.pop();
    const symbols = randomFinalSymbols();
    // compute wild multiplier sum
    let wildMultiplierSum = 0;
    symbols.forEach(s => { if (s.isWild) wildMultiplierSum += 1 + Math.floor(Math.random()*3); });
    const wildMultiplier = wildMultiplierSum > 0 ? wildMultiplierSum : 1;

    const win = evaluatePayout(symbols, betPerLine, lines) * wildMultiplier;
    totalWin += win;
    totalBet += betPerLine * lines;

    // scatter => award free spins (cap 50)
    let scatterCount = 0;
    symbols.forEach(s => { if (s.isScatter) scatterCount++; });
    if (scatterCount >= 3) {
      const key = scatterCount >= 5 ? 5 : scatterCount;
      const awarded = (key === 3 ? 10 : key === 4 ? 20 : 50);
      // push awarded free spins onto stack (but respect max 50 per round not tracked here)
      for (let k=0;k<awarded;k++) stack.push({ type: 'free' });
    }
  }

  return { totalBet, totalWin, rtp: totalWin/totalBet };
}

console.log(`Running ${spins} spins...`);
const start = Date.now();
const res = run(spins, 1.0, TOTAL_LINES);
const ms = (Date.now()-start);
console.log(`Total bet: ${res.totalBet.toFixed(2)}`);
console.log(`Total win: ${res.totalWin.toFixed(2)}`);
console.log(`RTP: ${(res.rtp*100).toFixed(4)}%`);
console.log(`Time: ${ms} ms`);
