// simulate_confirm.js
// Configurable full Monte-Carlo simulator matching index.html rules (25 paylines, wild restrictions, wild multipliers, free spins)

const args = process.argv.slice(2);
const spins = Number(args[0]) || 100000;
const wildWeight = Number(args[1]) || 6;
const multWeight = Number(args[2]) || 4;
const scatterWeight = Number(args[3]) || 1;
const memberWeight = Number(args[4]) || 5;
const multValue = Number(args[5]) || 2;
const scale = Number(args[6]) || 1.0;

const members = [];
for (let i=1;i<=10;i++) members.push({name:`User${i}`});
const SCATTER = {name:'SCATTER', isScatter:true};
const WILD = {name:'WILD', isWild:true};
const MULT = {name:'MULT', isMultiplier:true};

const ROWS=5, COLS=6, TOTAL_SLOTS=ROWS*COLS;

// pay-anywhere: no paylines
const TOTAL_LINES = 30; // legacy UI value for total bet calc

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
  User10:{3:0.50, 4:0.80, 5:3.00}
};

const BASE_SCATTER_PAYOUT = {3:5*5,4:15*5,5:30*5};

// apply scale
const SYMBOL_PAYOUTS = {};
Object.keys(BASE_SYMBOL_PAYOUTS).forEach(name=>{
  SYMBOL_PAYOUTS[name] = {};
  Object.keys(BASE_SYMBOL_PAYOUTS[name]).forEach(k=> {
    SYMBOL_PAYOUTS[name][k] = BASE_SYMBOL_PAYOUTS[name][k] * scale * 5; // scale*5 like index.html tuning
  });
});
const SCATTER_PAYOUT = {};
Object.keys(BASE_SCATTER_PAYOUT).forEach(k=> SCATTER_PAYOUT[k] = BASE_SCATTER_PAYOUT[k] * scale);
const FREE_SPIN_TRIGGER = 3;
const FREE_SPIN_AWARDS = {3:10,4:20,5:50};

function buildWeighted() {
  const arr = [];
  members.forEach(m=> arr.push({symbol:m, weight:memberWeight}));
  if (scatterWeight>0) arr.push({symbol:SCATTER, weight:scatterWeight});
  if (wildWeight>0) arr.push({symbol:WILD, weight:wildWeight});
  if (multWeight>0) arr.push({symbol:MULT, weight:multWeight});
  const total = arr.reduce((s,e)=>s+e.weight,0);
  return {arr,total};
}

const rng = require('./rng_node');
function pickRandom(arr, total) {
  let r = rng.next()*total;
  for (const e of arr) {
    if (r < e.weight) return e.symbol;
    r -= e.weight;
  }
  return arr[0].symbol;
}

function randomFinalSymbols(arr, total) {
  const final = [];
  for (let i=0;i<TOTAL_SLOTS;i++) {
    const col = i % COLS;
    while (true) {
      const s = pickRandom(arr, total);
      if (s.isWild && (col === 0 || col === COLS-1)) continue;
      final.push(s);
      break;
    }
  }
  return final;
}

function evaluatePayout(resultSymbols, currentBetPerLine, currentLines) {
  let totalWinBase = 0;
  const baseTotalBet = currentBetPerLine * currentLines;

  let scatterCount = 0;
  resultSymbols.forEach(s=>{ if (s.isScatter) scatterCount++; });

  const counts = new Map();
  resultSymbols.forEach(sym => {
    if (sym.isScatter || sym.isMultiplier) return;
    if (sym.isWild) return; // wilds handled as jokers separately
    counts.set(sym.name, (counts.get(sym.name) || 0) + 1);
  });
  // collect wild indices
  const wildIndices = [];
  resultSymbols.forEach((s, idx) => { if (s.isWild) wildIndices.push(idx); });

  counts.forEach((cnt, key) => {
    const natural = cnt;
    const effective = natural + wildIndices.length;
    if (effective < 3) return;
    const pk = effective >=5 ? 5 : effective;
    const basePayout = (SYMBOL_PAYOUTS[key] && SYMBOL_PAYOUTS[key][pk]) || 0;
    if (basePayout > 0) {
      const multCount = resultSymbols.filter(s => s.isMultiplier).length;
      const symMult = multCount > 0 ? Math.pow(multValue, multCount) : 1;
      totalWinBase += basePayout * symMult * currentBetPerLine;
    }
  });

  if (scatterCount >= FREE_SPIN_TRIGGER) {
    const key = scatterCount >=5 ? 5 : scatterCount;
    const scatterMult = SCATTER_PAYOUT[key] || 0;
    if (scatterMult>0) totalWinBase += scatterMult * baseTotalBet;
  }

  let wildMultiplierSum = 0;
  resultSymbols.forEach(s=>{ if (s.isWild) wildMultiplierSum += 1 + Math.floor(rng.next()*3); });
  const wildMultiplier = wildMultiplierSum>0 ? wildMultiplierSum : 1;

  return totalWinBase * wildMultiplier;
}

function runSimulation(spins) {
  const {arr,total} = buildWeighted();
  let totalBet = 0, totalWin = 0;
  const stack = [];
  for (let i=0;i<spins;i++) stack.push({type:'base'});

  while (stack.length) {
    const t = stack.pop();
    const symbols = randomFinalSymbols(arr, total);
    const win = evaluatePayout(symbols, 1.0, TOTAL_LINES);
    totalWin += win;
    totalBet += 1.0 * TOTAL_LINES;

    // scatter -> award free spins
    let scatterCount = 0; symbols.forEach(s=>{ if (s.isScatter) scatterCount++; });
    if (scatterCount >= 3) {
      const key = scatterCount >=5 ? 5 : scatterCount;
      const awarded = FREE_SPIN_AWARDS[key] || 0;
      for (let k=0;k<awarded;k++) stack.push({type:'free'});
    }
  }
  return { totalBet, totalWin, rtp: totalWin/totalBet };
}

console.log(`Confirm sim: spins=${spins} wildW=${wildWeight} multW=${multWeight} scatterW=${scatterWeight} memberW=${memberWeight} multV=${multValue}`);
const start = Date.now();
const res = runSimulation(spins);
const ms = Date.now()-start;
console.log(`Total bet: ${res.totalBet.toFixed(2)}`);
console.log(`Total win: ${res.totalWin.toFixed(2)}`);
console.log(`RTP: ${(res.rtp*100).toFixed(4)}%`);
console.log(`Time: ${ms} ms`);
