// simulate_tune.js
// Auto-tune payout scale to reach target RTP by scaling OF_A_KIND_MULT and SCATTER_PAYOUT

const args = process.argv.slice(2);
const targetPct = Number(args[0]) || 96; // percent
const spinsEval = Number(args[1]) || 20000; // spins per evaluation
const spinsConfirm = Number(args[2]) || 100000; // final confirm spins

// --- base config (copied from simulate_rtp.js)
const members = [];
for (let i = 1; i <= 10; i++) members.push({ name: `User${i}` });
const SCATTER = { name: 'SCATTER', isScatter: true };
const WILD = { name: 'WILD', isWild: true };
const MULT = { name: 'MULT', isMultiplier: true };
const ROWS = 3, COLS = 5, TOTAL_SLOTS = ROWS * COLS;
const PAYLINES = [
  { slots: [5,6,7,8,9] },{ slots: [0,1,2,3,4] },{ slots: [10,11,12,13,14] },
  { slots: [0,6,12,8,4] },{ slots: [10,6,2,8,14] },{ slots: [0,6,7,8,4] },
  { slots: [10,6,7,8,14] },{ slots: [5,1,7,13,9] },{ slots: [5,11,7,3,9] },{ slots: [0,11,2,13,4] }
];
const TOTAL_LINES = PAYLINES.length;
const BASE_OF_A_KIND_MULT = { 3:2, 4:5, 5:10 };
const BASE_SCATTER_PAYOUT = { 3:5, 4:15, 5:30 };
const BASE_SYMBOL_PAYOUTS = {
  User1: {3:4.00, 4:8.00, 5:50.00},
  User2: {3:1.20, 4:3.00, 5:10.00},
  User3: {3:1.20, 4:3.00, 5:10.00},
  User4: {3:0.80, 4:1.50, 5:6.00},
  User5: {3:0.80, 4:1.50, 5:6.00},
  User6: {3:0.50, 4:0.80, 5:3.00},
  User7: {3:0.50, 4:0.80, 5:3.00},
  User8: {3:0.50, 4:0.80, 5:3.00},
  User9: {3:0.50, 4:0.80, 5:3.00},
  User10:{3:0.50,4:0.80, 5:3.00}
};
const FREE_SPIN_TRIGGER = 3;
const FREE_SPIN_AWARDS = {3:10,4:20,5:50};
const MULT_VALUE = 2;

// weights
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

function randomFinalSymbols() {
  const final = [];
  for (let i=0;i<TOTAL_SLOTS;i++) final.push(randomSymbol());
  return final;
}

function evaluatePayoutScaled(resultSymbols, currentBetPerLine, currentLines, symbolPayouts, scatterPayout) {
  let totalWinBase = 0;
  const baseTotalBet = currentBetPerLine * currentLines;

  // scatter
  let scatterCount = 0;
  resultSymbols.forEach(sym => { if (sym.isScatter) scatterCount++; });

  for (let li=0; li<currentLines; li++) {
    const indices = PAYLINES[li].slots;
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
          basePayout = symbolPayouts['User1'] ? symbolPayouts['User1'][count] || 0 : 0;
        } else {
          basePayout = (symbolPayouts[cand.name] && symbolPayouts[cand.name][count]) || 0;
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
    const scatterMult = scatterPayout[key] || 0;
    if (scatterMult>0) totalWinBase += scatterMult * baseTotalBet;
  }

  return totalWinBase;
}

function simulateOnce(betPerLine, lines, ofMult, scatterPayout) {
  const symbols = randomFinalSymbols();
  return evaluatePayoutScaled(symbols, betPerLine, lines, ofMult, scatterPayout);
}

function simulate(spins, betPerLine, lines, ofMult, scatterPayout) {
  let totalBet=0, totalWin=0;
  for (let i=0;i<spins;i++) {
    const win = simulateOnce(betPerLine, lines, ofMult, scatterPayout);
    totalWin += win;
    totalBet += betPerLine * lines;
  }
  return { totalBet, totalWin, rtp: totalWin/totalBet };
}

// --- search: scale OF_A_KIND_MULT and SCATTER_PAYOUT by factor
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
  // exponential search to find high factor
  let low = 0.0001, high = 1.0;
  let lastRtp = 0;
  for (let iter=0; iter<40; iter++) {
    const { of, sc } = scaleMaps(high);
    const res = simulate(spinsEval, 1.0, TOTAL_LINES, of ? of : undefined, sc.sym ? sc.sym : sc);
    lastRtp = res.rtp;
    const pct = res.rtp * 100;
    console.log(`iter ${iter} test factor=${high.toFixed(6)} -> RTP ${pct.toFixed(4)}%`);
    if (pct >= targetRtp) break;
    low = high;
    high *= 2;
    if (high > 1e8) break;
  }

  // binary search between low and high
  let bestFactor = high;
  for (let iter=0; iter<25; iter++) {
    const mid = (low + high) / 2;
    const { sym, sc } = scaleMaps(mid);
    const res = simulate(spinsEval, 1.0, TOTAL_LINES, sym, sc);
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
  const target = targetPct;
  const factor = await findScale(target, spinsEval);
  console.log(`Found factor ≈ ${factor}`);
  const { of, sc } = scaleMaps(factor);
  console.log('Confirming with larger simulation...');
  const res = simulate(spinsConfirm, 1.0, TOTAL_LINES, of, sc);
  console.log(`Confirm RTP: ${(res.rtp*100).toFixed(4)}% (spins=${spinsConfirm})`);
  console.log('Scaled OF_A_KIND_MULT:', of);
  console.log('Scaled SCATTER_PAYOUT:', sc);
})();
