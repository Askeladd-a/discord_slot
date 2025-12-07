// simulate_hybrid.js
// Hybrid tuning: modest payout scaling combined with WILD/MULT weight sweeps.

const args = process.argv.slice(2);
const targetPct = Number(args[0]) || 96;
const spinsSearch = Number(args[1]) || 20000;
const spinsConfirm = Number(args[2]) || 200000;

// base data (from index.html)
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
const FREE_SPIN_AWARDS = {3:10,4:20,5:50};

function buildWeighted(wildW, multW, scatterW, memberW) {
  const arr = [];
  members.forEach(m=> arr.push({symbol:m, weight:memberW}));
  if (scatterW>0) arr.push({symbol:SCATTER, weight:scatterW});
  if (wildW>0) arr.push({symbol:WILD, weight:wildW});
  if (multW>0) arr.push({symbol:MULT, weight:multW});
  const total = arr.reduce((s,e)=>s+e.weight,0);
  return {arr,total};
}

function pickRandom(arr,total) {
  let r = Math.random()*total;
  for (const e of arr) {
    if (r < e.weight) return e.symbol;
    r -= e.weight;
  }
  return arr[0].symbol;
}

function randomFinal(arr,total) {
  const final = [];
  for (let i=0;i<TOTAL_SLOTS;i++) {
    const col = i % COLS;
    while (true) {
      const s = pickRandom(arr,total);
      if (s.isWild && (col === 0 || col === COLS-1)) continue;
      final.push(s);
      break;
    }
  }
  return final;
}

function evaluatePayout(resultSymbols, currentBetPerLine, currentLines, symbolPayouts, scatterPayout, multValue) {
  let totalWinBase = 0;
  const baseTotalBet = currentBetPerLine * currentLines;

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
      const isWild = !!cand.isWild;
      let count = 0;
      for (let pos=0; pos<indices.length; pos++) {
        const sym = lineSyms[pos];
        if (sym.isScatter || sym.isMultiplier) break;
        if (!isWild) {
          if (!(sym.name === cand.name || sym.isWild)) break;
        } else {
          if (!sym.isWild) break;
        }
        count++;
      }
      if (count>=3) {
        let basePayout = 0;
        if (isWild) basePayout = symbolPayouts['User1'] ? symbolPayouts['User1'][count] || 0 : 0;
        else basePayout = (symbolPayouts[cand.name] && symbolPayouts[cand.name][count]) || 0;
        if (basePayout>0) {
          const lineWin = basePayout * lineMultiplier;
          if (lineWin>bestLineWin) bestLineWin = lineWin;
        }
      }
    });
    if (bestLineWin>0) totalWinBase += bestLineWin;
  }

  if (scatterCount >= 3) {
    const key = scatterCount >=5 ? 5 : scatterCount;
    const scatterMult = scatterPayout[key] || 0;
    if (scatterMult>0) totalWinBase += scatterMult * baseTotalBet;
  }

  // wild multiplier
  let wildMultiplierSum=0; resultSymbols.forEach(s=>{ if (s.isWild) wildMultiplierSum += 1 + Math.floor(Math.random()*3); });
  const wildMultiplier = wildMultiplierSum>0 ? wildMultiplierSum : 1;
  return totalWinBase * wildMultiplier;
}

function simulateConfig(spins, scale, wildW, multW, multV) {
  const symbolPayouts = {};
  Object.keys(BASE_SYMBOL_PAYOUTS).forEach(name=>{
    symbolPayouts[name] = {};
    Object.keys(BASE_SYMBOL_PAYOUTS[name]).forEach(k=> {
      symbolPayouts[name][k] = BASE_SYMBOL_PAYOUTS[name][k] * scale;
    });
  });
  const scatterPayout = {};
  Object.keys(BASE_SCATTER_PAYOUT).forEach(k=> scatterPayout[k] = BASE_SCATTER_PAYOUT[k] * scale);

  const {arr,total} = buildWeighted(wildW, multW, 1, 5);
  let totalBet=0, totalWin=0;
  const stack = [];
  for (let i=0;i<spins;i++) stack.push({type:'base'});
  while (stack.length) {
    stack.pop();
    const symbols = randomFinal(arr,total);
    const winBase = evaluatePayout(symbols, 1.0, TOTAL_LINES, symbolPayouts, scatterPayout, multV);
    totalWin += winBase;
    totalBet += 1.0 * TOTAL_LINES;
    // scatter free-spins
    let scatterCount=0; symbols.forEach(s=>{ if (s.isScatter) scatterCount++; });
    if (scatterCount >=3) {
      const awarded = FREE_SPIN_AWARDS[ scatterCount>=5?5:scatterCount ] || 0;
      for (let k=0;k<awarded;k++) stack.push({type:'free'});
    }
  }
  return { totalBet, totalWin, rtp: totalWin/totalBet };
}

(async function main(){
  console.log(`Hybrid tuning: target=${targetPct}% searchSpins=${spinsSearch} confirmSpins=${spinsConfirm}`);
  const scales = [1.0, 1.5, 2.0, 3.0, 5.0];
  const results = [];
  for (const scale of scales) {
    for (let wildW=1; wildW<=8; wildW++) {
      for (let multW=0; multW<=4; multW++) {
        for (let multV=2; multV<=3; multV++) {
          const res = simulateConfig(spinsSearch, scale, wildW, multW, multV);
          const pct = res.rtp*100;
          results.push({scale,wildW,multW,multV,pct});
        }
      }
    }
    console.log(`scale ${scale} scanned`);
  }
  results.sort((a,b)=>Math.abs(a.pct-targetPct)-Math.abs(b.pct-targetPct));
  console.log('Top candidates (search):');
  results.slice(0,8).forEach(r=> console.log(r));

  // confirm top 3 with larger sims
  const top = results.slice(0,6);
  console.log('Confirming top candidates with larger simulations...');
  for (const c of top) {
    const res = simulateConfig(spinsConfirm, c.scale, c.wildW, c.multW, c.multV);
    console.log(`CONFIRM scale=${c.scale} wildW=${c.wildW} multW=${c.multW} multV=${c.multV} -> ${(res.rtp*100).toFixed(4)}%`);
  }
})();
