// simulate_sweep.js
// Sweep weights for WILD and MULT and MULT_VALUE to find configs approaching target RTP

const args = process.argv.slice(2);
const targetPct = Number(args[0]) || 96;
const spinsPerCandidate = Number(args[1]) || 10000;
const confirmSpins = Number(args[2]) || 100000;

// base symbols
const members = [];
for (let i=1;i<=12;i++) members.push({name:`User${i}`} );
const SCATTER = {name:'SCATTER', isScatter:true};
const WILD = {name:'WILD', isWild:true};
const MULT = {name:'MULT', isMultiplier:true};

const ROWS=5, COLS=6, TOTAL_SLOTS=ROWS*COLS;
const PAYLINES = [
  {slots:[5,6,7,8,9]},{slots:[0,1,2,3,4]},{slots:[10,11,12,13,14]},{slots:[0,6,12,8,4]},{slots:[10,6,2,8,14]}
];
const TOTAL_LINES = 30; // legacy UI total-bet approximation for pay-anywhere (6x5 ~ 30 positions)

const SYMBOL_PAYOUTS = {
  User1: {3:4.00,4:8.00,5:50.00},
  User2: {3:1.20,4:3.00,5:10.00},
  User3: {3:1.20,4:3.00,5:10.00},
  User4: {3:0.80,4:1.50,5:6.00},
  User5: {3:0.80,4:1.50,5:6.00},
  User6: {3:0.50,4:0.80,5:3.00},
  User7: {3:0.50,4:0.80,5:3.00},
  User8: {3:0.50,4:0.80,5:3.00},
  User9: {3:0.50,4:0.80,5:3.00},
  User10:{3:0.50,4:0.80,5:3.00}
};
const BASE_SCATTER_PAYOUT = {3:5*5,4:15*5,5:30*5};
const FREE_SPIN_AWARDS = {3:10,4:20,5:50};

function makeWeighted(weights) {
  const arr = [];
  for (const name of Object.keys(weights)) {
    const w = weights[name];
    if (w>0) arr.push({symbol:{name, ...((name==='SCATTER')?{isScatter:true}:{})}, weight:w});
  }
  return arr;
}

function pickRandomFromWeighted(arr, totalWeight) {
  let r = Math.random()*totalWeight;
  for (const e of arr) {
    if (r < e.weight) return e.symbol;
    r -= e.weight;
  }
  return arr[0].symbol;
}

function buildWeightedSymbols(wildWeight, multWeight, scatterWeight, memberWeight) {
  const weighted = [];
  members.forEach(m=> weighted.push({symbol:m, weight:memberWeight}));
  if (scatterWeight>0) weighted.push({symbol:SCATTER, weight:scatterWeight});
  if (wildWeight>0) weighted.push({symbol:WILD, weight:wildWeight});
  if (multWeight>0) weighted.push({symbol:MULT, weight:multWeight});
  const total = weighted.reduce((s,e)=>s+e.weight,0);
  return {weighted, total};
}

function randomFinalSymbolsFromWeighted(w, total) {
  const final = [];
  for (let i=0;i<TOTAL_SLOTS;i++) {
    const col = i % COLS;
    while (true) {
      const sym = pickRandomFromWeighted(w, total);
      if (sym.isWild && (col === 0 || col === COLS-1)) continue;
      final.push(sym);
      break;
    }
  }
  return final;
}

function evaluatePayout(resultSymbols, lines, multValue) {
  let totalWinBase = 0;
  const baseTotalBet = 1 * lines;
  // scatter
  let scatterCount=0; resultSymbols.forEach(s=>{ if (s.isScatter) scatterCount++; });

  for (let li=0; li<lines; li++) {
    // For speed we simplify and consider only central paylines distribution approximation here
    // We'll compute line wins for a reduced set of paylines for quick scan; final confirm will use simulate_rtp.js for full logic.
    // simplified: treat 1 line (central) as proxy
    const indices = [5,6,7,8,9];
    const lineSyms = indices.map(i=>resultSymbols[i]);
    const multCount = indices.filter(i=> resultSymbols[i].isMultiplier).length;
    const lineMultiplier = multCount>0 ? Math.pow(multValue, multCount) : 1;

    // simplified pay-anywhere check: count naturals + wilds as jokers for central proxies
    const naturalCounts = {};
    let wildCount = 0;
    lineSyms.forEach(s => {
      if (s.isScatter || s.isMultiplier) return;
      if (s.isWild) { wildCount++; return; }
      naturalCounts[s.name] = (naturalCounts[s.name] || 0) + 1;
    });
    Object.keys(naturalCounts).forEach(name => {
      const natural = naturalCounts[name];
      const effective = natural + wildCount;
      if (effective < 3) return;
      const pk = effective >=5 ? 5 : effective;
      const base = (SYMBOL_PAYOUTS[name] && SYMBOL_PAYOUTS[name][pk]) || 0;
      if (base>0) totalWinBase += base * lineMultiplier;
    });
  }

  if (scatterCount>=3) {
    const key = scatterCount>=5?5:scatterCount;
    totalWinBase += (BASE_SCATTER_PAYOUT[key] || 0) * baseTotalBet;
  }

  let wildMultiplierSum=0; resultSymbols.forEach(s=>{ if (s.isWild) wildMultiplierSum += 1 + Math.floor(Math.random()*3); });
  const wildMultiplier = wildMultiplierSum>0?wildMultiplierSum:1;
  return totalWinBase * wildMultiplier;
}

function quickEvaluateConfig(wildW, multW, scatterW, memberW, multValue, spins) {
  const {weighted, total} = buildWeightedSymbols(wildW, multW, scatterW, memberW);
  let totalBet=0, totalWin=0;
  for (let i=0;i<spins;i++) {
    const symbols = randomFinalSymbolsFromWeighted(weighted, total);
    const win = evaluatePayout(symbols, 1, multValue);
    totalWin += win;
    totalBet += 1 * TOTAL_LINES; // approximate total bet using TOTAL_LINES
  }
  return { totalBet, totalWin, rtp: totalWin/totalBet };
}

async function runSweep() {
  console.log(`Sweep target ${targetPct}% spinsPerCandidate=${spinsPerCandidate} confirm=${confirmSpins}`);
  const memberW = 5;
  const scatterW = 1;
  const results = [];
  for (let wildW=1; wildW<=6; wildW++) {
    for (let multW=0; multW<=4; multW++) {
      for (let multV=2; multV<=4; multV++) {
        const res = quickEvaluateConfig(wildW, multW, scatterW, memberW, multV, spinsPerCandidate);
        const pct = res.rtp*100;
        results.push({wildW, multW, multV, pct});
        if (pct >= targetPct-2) { // candidate near target
          console.log(`Candidate near target: wildW=${wildW} multW=${multW} multV=${multV} -> ${(pct).toFixed(4)}%`);
          // run confirm via simulate_rtp.js by spawning node process for accurate 25-paylines evaluate (full logic)
          // but for simplicity we just note candidate here
        }
      }
    }
  }
  results.sort((a,b)=>Math.abs(a.pct-targetPct)-Math.abs(b.pct-targetPct));
  console.log('Top candidates:');
  results.slice(0,8).forEach(r=> console.log(r));
}

runSweep();
