// simulate_tune.js
// Simple tuner for pay-anywhere engine: scales symbol payouts and scatter payouts

const args = process.argv.slice(2);
const targetPct = Number(args[0]) || 96;
const spinsEval = Number(args[1]) || 20000;
const spinsConfirm = Number(args[2]) || 100000;

// base config (match index.html)
const members = [];
for (let i = 1; i <= 12; i++) members.push({ name: `User${i}` });
const SCATTER = { name: 'SCATTER', isScatter: true };
const WILD = { name: 'WILD', isWild: true };
const MULT = { name: 'MULT', isMultiplier: true };
const ROWS = 5, COLS = 6, TOTAL_SLOTS = ROWS * COLS;
const BASE_SYMBOL_PAYOUTS = {
  User1: {3:4.00*5, 4:8.00*5, 5:50.00*5},
  User2: {3:1.20*5,4:3.00*5,5:10.00*5},
  User3: {3:1.20*5,4:3.00*5,5:10.00*5},
  User4: {3:0.80*5,4:1.50*5,5:6.00*5},
  User5: {3:0.80*5,4:1.50*5,5:6.00*5},
  User6: {3:0.50*5,4:0.80*5,5:3.00*5},
  User7: {3:0.50*5,4:0.80*5,5:3.00*5},
  User8: {3:0.50*5,4:0.80*5,5:3.00*5},
  User9: {3:0.50*5,4:0.80*5,5:3.00*5},
  User10:{3:0.50*5,4:0.80*5,5:3.00*5}
};
const BASE_SCATTER_PAYOUT = {3:5*5,4:15*5,5:30*5};
const FREE_SPIN_TRIGGER = 3;
const FREE_SPIN_AWARDS = {3:10,4:20,5:50};
const MULT_VALUE = 2;

// weights
const WEIGHTED = [];
members.forEach(m=>WEIGHTED.push({symbol:m, weight:5}));
WEIGHTED.push({symbol:SCATTER, weight:1});
WEIGHTED.push({symbol:WILD, weight:6});
WEIGHTED.push({symbol:MULT, weight:4});
const TOTAL_WEIGHT = WEIGHTED.reduce((s,e)=>s+e.weight,0);
const rng = require('./rng_node');

function randomSymbol() {
  let r = rng.next() * TOTAL_WEIGHT;
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
    let sym;
    while (true) {
      sym = randomSymbol();
      if (sym.isWild && (col === 0 || col === COLS-1)) continue;
      break;
    }
    final.push(sym);
  }
  return final;
}

function evaluatePayoutScaled(resultSymbols, currentBetPerLine, currentLines, symbolPayouts, scatterPayout) {
  let totalWinBase = 0;
  const baseTotalBet = currentBetPerLine * currentLines;

  let scatterCount = 0;
  resultSymbols.forEach(sym => { if (sym.isScatter) scatterCount++; });

  const counts = new Map();
  resultSymbols.forEach(sym => {
    if (sym.isScatter || sym.isMultiplier) return;
    const key = sym.isWild ? 'WILD' : sym.name;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  counts.forEach((cnt, key) => {
    if (cnt < 3) return;
    const pk = cnt >=5 ? 5 : cnt;
    let basePayout = 0;
    if (key === 'WILD') basePayout = symbolPayouts['User1'] ? symbolPayouts['User1'][pk] || 0 : 0;
    else basePayout = (symbolPayouts[key] && symbolPayouts[key][pk]) || 0;
    if (basePayout > 0) {
      const multCount = resultSymbols.filter(s => s.isMultiplier).length;
      const symMult = multCount > 0 ? Math.pow(MULT_VALUE, multCount) : 1;
      totalWinBase += basePayout * symMult * currentBetPerLine;
    }
  });

  if (scatterCount >= FREE_SPIN_TRIGGER) {
    const key = scatterCount >=5 ? 5 : scatterCount;
    const scatterMult = scatterPayout[key] || 0;
    if (scatterMult>0) totalWinBase += scatterMult * baseTotalBet;
  }

  let wildMultiplierSum = 0;
  resultSymbols.forEach((s) => { if (s.isWild) wildMultiplierSum += 1 + Math.floor(rng.next()*3); });
  const wildMultiplier = wildMultiplierSum > 0 ? wildMultiplierSum : 1;

  return totalWinBase * wildMultiplier;
}

function simulateOnce(betPerLine, lines, symbolPayouts, scatterPayout) {
  const symbols = randomFinalSymbols();
  return evaluatePayoutScaled(symbols, betPerLine, lines, symbolPayouts, scatterPayout);
}

function simulate(spins, betPerLine, lines, symbolPayouts, scatterPayout) {
  let totalBet=0, totalWin=0;
  for (let i=0;i<spins;i++) {
    const win = simulateOnce(betPerLine, lines, symbolPayouts, scatterPayout);
    totalWin += win;
    totalBet += betPerLine * lines;
  }
  return { totalBet, totalWin, rtp: totalWin/totalBet };
}

function scaleMaps(factor) {
  const sc = {};
  Object.keys(BASE_SCATTER_PAYOUT).forEach(k => sc[k] = BASE_SCATTER_PAYOUT[k] * factor);
  const sym = {};
  Object.keys(BASE_SYMBOL_PAYOUTS).forEach(name => {
    sym[name] = {};
    Object.keys(BASE_SYMBOL_PAYOUTS[name]).forEach(k => {
      sym[name][k] = BASE_SYMBOL_PAYOUTS[name][k] * factor;
    });
  });
  return { sym, sc };
}

async function findScale(targetRtp, spinsEval) {
  let low = 0.0001, high = 1.0;
  for (let iter=0; iter<40; iter++) {
    const { sym, sc } = scaleMaps(high);
    const res = simulate(spinsEval, 1.0, 30, sym, sc);
    const pct = res.rtp * 100;
    console.log(`iter ${iter} test factor=${high.toFixed(6)} -> RTP ${pct.toFixed(4)}%`);
    if (pct >= targetRtp) break;
    low = high;
    high *= 2;
    if (high > 1e8) break;
  }

  let bestFactor = high;
  for (let iter=0; iter<25; iter++) {
    const mid = (low + high) / 2;
    const { sym, sc } = scaleMaps(mid);
    const res = simulate(spinsEval, 1.0, 30, sym, sc);
    const pct = res.rtp * 100;
    console.log(`bs ${iter} mid=${mid.toFixed(6)} -> ${pct.toFixed(4)}%`);
    if (pct >= targetRtp) {
      bestFactor = mid;
      high = mid;
    } else {
      low = mid;
    }
  }
  return bestFactor;
}

(async function main(){
  console.log(`Target RTP: ${targetPct}%  (eval spins=${spinsEval}, confirm spins=${spinsConfirm})`);
  const factor = await findScale(targetPct, spinsEval);
  console.log(`Found factor ≈ ${factor}`);
  const { sym, sc } = scaleMaps(factor);
  console.log('Confirming with larger simulation...');
  const res = simulate(spinsConfirm, 1.0, 30, sym, sc);
  console.log(`Confirm RTP: ${(res.rtp*100).toFixed(4)}% (spins=${spinsConfirm})`);
})();
