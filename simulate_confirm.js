// simulate_confirm.js
// Configurable full Monte-Carlo simulator matching index.html rules (25 paylines, wild restrictions, wild multipliers, free spins)

const args = process.argv.slice(2);
const spins = Number(args[0]) || 100000;
const wildWeight = Number(args[1]) || 2;
const multWeight = Number(args[2]) || 1;
const scatterWeight = Number(args[3]) || 1;
const memberWeight = Number(args[4]) || 5;
const multValue = Number(args[5]) || 2;
const scale = Number(args[6]) || 1.0;

const members = [];
for (let i=1;i<=10;i++) members.push({name:`User${i}`});
const SCATTER = {name:'SCATTER', isScatter:true};
const WILD = {name:'WILD', isWild:true};
const MULT = {name:'MULT', isMultiplier:true};

const ROWS=3, COLS=5, TOTAL_SLOTS=ROWS*COLS;

const PAYLINES = [
  { name: "Linea 1", slots: [5, 6, 7, 8, 9] },
  { name: "Linea 2", slots: [0, 1, 2, 3, 4] },
  { name: "Linea 3", slots: [10, 11, 12, 13, 14] },
  { name: "Linea 4", slots: [0, 6, 12, 8, 4] },
  { name: "Linea 5", slots: [10, 6, 2, 8, 14] },
  { name: "Linea 6", slots: [0, 1, 1, 1, 0].map((r,c)=>r*5+c) },
  { name: "Linea 7", slots: [2, 2, 1, 2, 2].map((r,c)=>r*5+c) },
  { name: "Linea 8", slots: [1, 0, 0, 0, 1].map((r,c)=>r*5+c) },
  { name: "Linea 9", slots: [1, 2, 2, 2, 1].map((r,c)=>r*5+c) },
  { name: "Linea 10", slots: [0, 1, 1, 1, 0].map((r,c)=>r*5+c) },
  { name: "Linea 11", slots: [2, 1, 1, 1, 2].map((r,c)=>r*5+c) },
  { name: "Linea 12", slots: [1, 0, 1, 0, 1].map((r,c)=>r*5+c) },
  { name: "Linea 13", slots: [1, 2, 1, 2, 1].map((r,c)=>r*5+c) },
  { name: "Linea 14", slots: [0, 1, 0, 1, 0].map((r,c)=>r*5+c) },
  { name: "Linea 15", slots: [2, 1, 2, 1, 2].map((r,c)=>r*5+c) },
  { name: "Linea 16", slots: [0, 0, 2, 0, 0].map((r,c)=>r*5+c) },
  { name: "Linea 17", slots: [2, 2, 0, 2, 2].map((r,c)=>r*5+c) },
  { name: "Linea 18", slots: [0, 2, 1, 2, 0].map((r,c)=>r*5+c) },
  { name: "Linea 19", slots: [2, 0, 1, 0, 2].map((r,c)=>r*5+c) },
  { name: "Linea 20", slots: [1, 0, 2, 0, 1].map((r,c)=>r*5+c) },
  { name: "Linea 21", slots: [1, 2, 0, 2, 1].map((r,c)=>r*5+c) },
  { name: "Linea 22", slots: [0, 2, 2, 2, 0].map((r,c)=>r*5+c) },
  { name: "Linea 23", slots: [2, 0, 0, 0, 2].map((r,c)=>r*5+c) },
  { name: "Linea 24", slots: [0, 1, 2, 0, 1].map((r,c)=>r*5+c) },
  { name: "Linea 25", slots: [2, 1, 0, 2, 1].map((r,c)=>r*5+c) }
];

const TOTAL_LINES = PAYLINES.length;

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

const BASE_SCATTER_PAYOUT = {3:5,4:15,5:30};

// apply scale
const SYMBOL_PAYOUTS = {};
Object.keys(BASE_SYMBOL_PAYOUTS).forEach(name=>{
  SYMBOL_PAYOUTS[name] = {};
  Object.keys(BASE_SYMBOL_PAYOUTS[name]).forEach(k=> {
    SYMBOL_PAYOUTS[name][k] = BASE_SYMBOL_PAYOUTS[name][k] * scale;
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

function pickRandom(arr, total) {
  let r = Math.random()*total;
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

  // scatter
  let scatterCount = 0;
  resultSymbols.forEach(s=>{ if (s.isScatter) scatterCount++; });

  for (let li=0; li<currentLines; li++) {
    const indices = PAYLINES[li].slots;
    const lineSyms = indices.map(i=>resultSymbols[i]);

    const multSlots = indices.filter(i=>resultSymbols[i].isMultiplier);
    const multCount = multSlots.length;
    const lineMultiplier = multCount>0 ? Math.pow(multValue, multCount) : 1;

    const candidates = [WILD, ...members];
    let bestLineWin = 0;

    candidates.forEach(cand=>{
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

  // wild multiplier sum
  let wildMultiplierSum = 0;
  resultSymbols.forEach(s=>{ if (s.isWild) wildMultiplierSum += 1 + Math.floor(Math.random()*3); });
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
    // wild multipliers already applied in evaluate? no, evaluate returns base*wildMultiplier
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
