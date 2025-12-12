// simulate_scatter.js
// Monte-Carlo simulation to estimate frequency of 4+ scatters after cascades
const rng = require('./rng_node');
const ROWS = 5, COLS = 6, TOTAL = ROWS * COLS;

// Symbols weights and definitions (mirror index.html)
const SYMBOLS = Array.from({length:12}, (_,i)=>({name:`S${i+1}`}));
const SCATTER = {name:'ZEUS', isScatter:true};
const MULT = {name:'MULT', isMultiplier:true};

const PAYTABLE = {
  S1: {12:100,10:50,8:20},
  S2: {12:50,10:20,8:5},
  S3: {12:30,10:10,8:4},
  S4: {12:24,10:4,8:3},
  S5: {12:20,10:3,8:2},
  S6: {12:16,10:2.4,8:1.6},
  S7: {12:10,10:2,8:1},
  S8: {12:8,10:1.8,8:0.8},
  S9: {12:4,10:1.5,8:0.5},
  S10:{12:4,10:1.5,8:0.5},
  S11:{12:4,10:1.5,8:0.5},
  S12:{12:4,10:1.5,8:0.5}
};

function payoutForCount(name, count){
  const table = PAYTABLE[name];
  if(!table) return 0;
  const keys = Object.keys(table).map(Number).sort((a,b)=>a-b);
  let matched = 0; for(const k of keys) if(count>=k) matched=k;
  return matched? table[matched] : 0;
}

function makeWeightedPool(){
  const pool=[];
  for(let i=0;i<SYMBOLS.length;i++){ pool.push({sym:SYMBOLS[i], weight:12 - i}); }
  pool.push({sym:SCATTER, weight:2});
  pool.push({sym:MULT, weight:1});
  return pool;
}

function pickWeightedFromPool(pool){
  const total = pool.reduce((s,e)=>s+e.weight,0);
  let r = rng.next()*total;
  for(const e of pool){ if(r < e.weight){
    const s = Object.assign({}, e.sym);
    if(s.isMultiplier){ /* value irrelevant for scatter sim */ }
    return s; }
    r -= e.weight;
  }
  return Object.assign({}, pool[0].sym);
}

function collectWins(grid){
  const counts=new Map(); let scatterCount=0; const multipliers=[];
  grid.forEach((s,idx)=>{
    if(!s) return;
    if(s.isScatter){ scatterCount++; return; }
    if(s.isMultiplier){ multipliers.push({idx, value: s.multValue || 0}); return; }
    counts.set(s.name,(counts.get(s.name)||[]).concat(idx));
  });
  const scatterWin = 0;
  const wins=[]; const remove=new Set(); let base=scatterWin;
  for(const [name,arr] of counts.entries()){
    const mult = payoutForCount(name, arr.length);
    if(mult>0){ wins.push({symbol:name,count:arr.length,payout:mult,indices:arr}); arr.forEach(i=>remove.add(i)); base += mult; }
  }
  return {wins,remove,base,scatterCount,multipliers};
}

function applyTumbleGrid(grid, removeSet, pool){
  const newGrid = [...grid];
  const drop = Array(TOTAL).fill(0);
  const newFlag = Array(TOTAL).fill(false);
  for(let c=0;c<COLS;c++){
    const kept=[]; const d=[]; let empty=0;
    for(let r=ROWS-1;r>=0;r--){ const idx=r*COLS+c; if(removeSet.has(idx)){ empty++; continue; } kept.push(grid[idx]); d.push(empty); }
    while(kept.length<ROWS){ kept.push(pickWeightedFromPool(pool)); d.push(ROWS); }
    for(let r=ROWS-1;r>=0;r--){ const idx=r*COLS+c; const ai=ROWS-1-r; newGrid[idx]=kept[ai]; drop[idx]=d[ai]; newFlag[idx]=d[ai]>=ROWS; }
  }
  return {grid:newGrid,drop,newFlag};
}

function simulateOnce(pool){
  // initial grid
  let grid = Array.from({length:TOTAL}, ()=>pickWeightedFromPool(pool));
  // resolve cascades
  while(true){
    const {wins,remove,base} = collectWins(grid);
    if(base<=0) break;
    if(remove.size===0) break;
    const next = applyTumbleGrid(grid, remove, pool);
    grid = next.grid;
  }
  const finalScatter = grid.filter(s=>s && s.isScatter).length;
  return finalScatter;
}

async function run(N=100000){
  const poolBase = makeWeightedPool();
  // copy pool for ante with modified scatter weight
  const poolAnte = makeWeightedPool().map(e=> ({...e}));
  // find scatter entry and multiply its weight by 3
  for(const e of poolAnte) if(e.sym && e.sym.isScatter) e.weight *= 3;

  const distBase = Array(TOTAL+1).fill(0);
  const distAnte = Array(TOTAL+1).fill(0);

  for(let i=0;i<N;i++){
    const s = simulateOnce(poolBase);
    distBase[s]++;
  }
  for(let i=0;i<N;i++){
    const s = simulateOnce(poolAnte);
    distAnte[s]++;
  }

  function summary(dist){
    const total = dist.reduce((a,b)=>a+b,0);
    const mean = dist.reduce((sum,v,idx)=>sum + v*idx,0)/total;
    const p4plus = dist.slice(4).reduce((a,b)=>a+b,0)/total;
    return {total,mean,p4plus,dist};
  }

  const out = {base: summary(distBase), ante: summary(distAnte)};
  console.log(JSON.stringify(out,null,2));
}

const N = process.argv[2] ? parseInt(process.argv[2],10) : 100000;
run(N).catch(e=>{ console.error(e); process.exit(1); });
