#!/usr/bin/env node
/*
  simulate_cluster.js
  Simple Monte-Carlo for a cluster-pay tumbler slot.
  Usage: node simulate_cluster.js --spins 100000 --seed 0123... --minSize 4 --rows 5 --cols 6 --diag false
*/
const crypto = require('crypto');

// ----- CLI parsing (small, no deps)
function parseArgs(){ const out={}; const a=process.argv.slice(2); for(let i=0;i<a.length;i++){ const p=a[i]; if(p.startsWith('--')){ const k=p.slice(2); const v=a[i+1] && !a[i+1].startsWith('--') ? a[++i] : true; out[k]=v; } } return out; }
const argv = parseArgs();
const SPINS = Number(argv.spins||100000); const MIN_SIZE = Number(argv.minSize||4); const ROWS = Number(argv.rows||5); const COLS = Number(argv.cols||6); const DIAG = (argv.diag==='true' || argv.diag===true) ? true : false;
const SEED = argv.seed;

// ----- Symbols and paytables (reuse same as client)
const SYMBOLS = [];
for(let i=1;i<=12;i++) SYMBOLS.push({name:`S${i}`,id:i,weight:12-i, img:`user${i}.png`});
const SCATTER = {name:'ZEUS',isScatter:true,weight:2};

const PAYTABLE = {
  S1: {12:100,10:50,8:20}, S2:{12:50,10:20,8:5}, S3:{12:30,10:10,8:4},
  S4:{12:24,10:4,8:3}, S5:{12:20,10:3,8:2}, S6:{12:16,10:2.4,8:1.6},
  S7:{12:10,10:2,8:1}, S8:{12:8,10:1.8,8:0.8},
  S9:{12:4,10:1.5,8:0.5}, S10:{12:4,10:1.5,8:0.5}, S11:{12:4,10:1.5,8:0.5}, S12:{12:4,10:1.5,8:0.5}
};
const SCATTER_PAYOUT = {6:200,5:100,4:6};

// weighted pool
const WEIGHTED = SYMBOLS.map(s=>({sym:s,weight:s.weight})); WEIGHTED.push({sym:SCATTER,weight:SCATTER.weight});

// ----- xoshiro128++ PRNG (seedable)
function makeXoshiro(){
  let s = new Uint32Array(4);
  function rotl(x,k){ return ((x<<k) | (x>>> (32-k))) >>> 0; }
  function next(){
    const result = (rotl((s[0] + s[3])>>>0, 7) + s[0]) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = rotl(s[3], 11);
    return result / 0x100000000;
  }
  function seedFromHex(hex){
    const h = (hex||'').replace(/[^0-9a-fA-F]/g,'');
    const padded = (h + '0'.repeat(32)).slice(0,32);
    const buf = Buffer.alloc(16);
    for(let i=0;i<16;i++) buf[i] = parseInt(padded.substr(i*2,2),16) || 0;
    for(let i=0;i<4;i++) s[i] = buf.readUInt32LE(i*4);
  }
  function seedFromCrypto(){ const buf = crypto.randomBytes(16); for(let i=0;i<4;i++) s[i] = buf.readUInt32LE(i*4); }
  return {next,seedFromHex,seedFromCrypto};
}

const rng = makeXoshiro(); if(argv.seed) rng.seedFromHex(argv.seed); else rng.seedFromCrypto();

function pickWeighted(){
  const effective = WEIGHTED.map(e=>({sym:e.sym,weight:e.weight}));
  const total = effective.reduce((acc,i)=>acc+i.weight,0);
  let r = rng.next()*total;
  for(const e of effective){ if(r < e.weight) return e.sym; r -= e.weight; }
  return effective[0].sym;
}

// grid helpers
function makeGrid(){ const g = new Array(ROWS*COLS); for(let i=0;i<g.length;i++) g[i]=pickWeighted(); return g; }
function idx(r,c){ return r*COLS + c; }

// adjacency for cluster detection
function neighbors(r,c){ const out=[]; const dirs = DIAG ? [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]] : [[-1,0],[1,0],[0,-1],[0,1]]; for(const [dr,dc] of dirs){ const nr=r+dr, nc=c+dc; if(nr>=0 && nr<ROWS && nc>=0 && nc<COLS) out.push([nr,nc]); } return out; }

// find clusters (excluding scatters)
function findClusters(grid){
  const visited = new Uint8Array(grid.length); const clusters=[];
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const i=idx(r,c); if(visited[i]) continue; const sym = grid[i]; if(!sym || sym.isScatter) { visited[i]=1; continue; }
    // BFS
    const q=[ [r,c] ]; visited[i]=1; const cells=[i];
    while(q.length){ const [cr,cc]=q.pop(); for(const [nr,nc] of neighbors(cr,cc)){ const ni=idx(nr,nc); if(visited[ni]) continue; const s=grid[ni]; if(!s || s.isScatter) { visited[ni]=1; continue; } if(s.name===sym.name){ visited[ni]=1; q.push([nr,nc]); cells.push(ni); } else { visited[ni]=1; } }}
    clusters.push({symbol: sym.name, indices: cells});
  }
  return clusters;
}

function payoutForCount(name,count){ const table = PAYTABLE[name]; if(!table) return 0; const keys = Object.keys(table).map(Number).sort((a,b)=>a-b); let matched=0; for(const k of keys) if(count>=k) matched=k; return matched? table[matched] : 0; }
function payoutForScatter(count){ if(count>=6) return SCATTER_PAYOUT[6]||0; if(count>=5) return SCATTER_PAYOUT[5]||0; if(count>=4) return SCATTER_PAYOUT[4]||0; return 0; }

// tumble: columns drop down, refill at top
function applyTumbleGrid(grid, removeSet){ const newGrid = grid.slice(); for(let c=0;c<COLS;c++){ const column=[]; for(let r=ROWS-1;r>=0;r--){ const i=idx(r,c); if(!removeSet.has(i)) column.push(newGrid[i]); }
  while(column.length<ROWS) column.push(pickWeighted()); for(let r=ROWS-1;r>=0;r--){ newGrid[idx(r,c)] = column[ROWS-1-r]; }} return newGrid; }

// simulate one spin: produce initial grid, then resolve clusters repeatedly
function resolveSpin(){ let grid = makeGrid(); let totalWin = 0; let scatterCount = 0; while(true){ // find scatter count separately
    scatterCount = grid.reduce((s,x)=> s + (x && x.isScatter ? 1:0), 0);
    // clusters
    const clusters = findClusters(grid);
    const remove = new Set(); let stepWin = 0;
    for(const cl of clusters){ if(cl.indices.length >= MIN_SIZE){ const pay = payoutForCount(cl.symbol, cl.indices.length); if(pay>0){ stepWin += pay; cl.indices.forEach(i=>remove.add(i)); } }}
    // scatter payout considered once per step
    const scatterPay = payoutForScatter(scatterCount);
    if(scatterPay>0){ stepWin += scatterPay; }
    if(stepWin<=0) break;
    totalWin += stepWin;
    // apply tumble
    grid = applyTumbleGrid(grid, remove);
    // continue chain
  }
  return {win: totalWin, scatter: scatterCount};
}

// run simulation
let totalBet = 0, totalPayout = 0;
for(let i=0;i<SPINS;i++){
  // default bet 1 per spin
  totalBet += 1;
  const res = resolveSpin(); totalPayout += res.win;
}

const meanRtp = totalPayout / totalBet;
console.log(`spins=${SPINS} rows=${ROWS} cols=${COLS} minSize=${MIN_SIZE} diag=${DIAG}`);
console.log(`totalBet=${totalBet} totalPayout=${totalPayout} meanRTP=${meanRtp.toFixed(6)}`);
