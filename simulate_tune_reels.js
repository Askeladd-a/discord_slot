// simulate_tune_reels.js
// Tune paytable by scaling payouts to reach a target RTP for the Reels payline engine
// Usage: node simulate_tune_reels.js --target 97 --eval 20000 --confirm 100000 --seed <hex>

const crypto = require('crypto');
const argv = process.argv.slice(2);
let target = 97; let evalSpins = 20000; let confirmSpins = 100000; let seedHex = null;
for(let i=0;i<argv.length;i++){
  if(argv[i]==='--target' && argv[i+1]){ target = Number(argv[i+1]); i++; }
  else if(argv[i]==='--eval' && argv[i+1]){ evalSpins = Number(argv[i+1]); i++; }
  else if(argv[i]==='--confirm' && argv[i+1]){ confirmSpins = Number(argv[i+1]); i++; }
  else if(argv[i]==='--seed' && argv[i+1]){ seedHex = argv[i+1]; i++; }
}

// PRNG (xoshiro128++)
let s = new Uint32Array(4);
function rotl(x,k){ return ((x<<k) | (x>>> (32-k))) >>> 0; }
function next(){ const result = (rotl((s[0] + s[3])>>>0, 7) + s[0]) >>> 0; const t = (s[1] << 9) >>> 0; s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11); return result / 0x100000000; }
function seedFromHex(hex){ const h = (hex||'').replace(/[^0-9a-fA-F]/g,'').padEnd(32,'0').slice(0,32); const buf = Buffer.from(h,'hex'); for(let i=0;i<4;i++) s[i] = buf.readUInt32LE(i*4); }
function seedFromCrypto(){ const buf = crypto.randomBytes(16); for(let i=0;i<4;i++) s[i] = buf.readUInt32LE(i*4); }
if(seedHex) seedFromHex(seedHex); else seedFromCrypto();
function rng(){ return next(); }

// base game definition copied from client/simulate_reels_stats
const ROWS=3, COLS=5; const SYMBOLS=[]; for(let i=1;i<=13;i++) SYMBOLS.push({name:'S'+i}); const SCATTER = {name:'ZEUS', isScatter:true};
const BASE_PAYTABLE = {
  S1: {12:100,10:50,8:20}, S2: {12:50,10:20,8:5}, S3: {12:30,10:10,8:4},
  S4: {12:24,10:4,8:3}, S5: {12:20,10:3,8:2}, S6: {12:16,10:2.4,8:1.6},
  S7: {12:10,10:2,8:1}, S8: {12:8,10:1.8,8:0.8}, S9: {12:4,10:1.5,8:0.5},
  S10:{12:4,10:1.5,8:0.5}, S11:{12:4,10:1.5,8:0.5}, S12:{12:4,10:1.5,8:0.5}
};
const BASE_SCATTER = {6:200,5:100,4:6};

const WEIGHTED = [];
for(let i=0;i<SYMBOLS.length;i++) WEIGHTED.push({sym: SYMBOLS[i], weight: 12 - i});
WEIGHTED.push({sym: SCATTER, weight:2});

const REEL_STRIP_LEN = 64; let reelStrips=null;
function initReelStrips(){ reelStrips=[]; for(let r=0;r<COLS;r++){ const strip=[]; for(let i=0;i<REEL_STRIP_LEN;i++){ const w = WEIGHTED[Math.floor(rng()*WEIGHTED.length)]; strip.push(w.sym); } reelStrips.push(strip); } }
function buildReelsFinal(){ if(!reelStrips) initReelStrips(); const final = Array(ROWS*COLS).fill(null); for(let c=0;c<COLS;c++){ const strip=reelStrips[c]; const start = Math.floor(rng()*strip.length); for(let r=0;r<ROWS;r++) final[r*COLS+c] = strip[(start+r)%strip.length]; } return final; }

function payoutForCount(table,name,count){ const t = table[name]; if(!t) return 0; const keys = Object.keys(t).map(Number).sort((a,b)=>a-b); let m=0; for(const k of keys) if(count>=k) m=k; return m? t[m] : 0; }
function payoutForScatter(table,count){ if(count>=6) return table[6]||0; if(count>=5) return table[5]||0; if(count>=4) return table[4]||0; return 0; }

function getPaylines(){ return [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[0,6,12,8,4],[10,6,2,8,14],[0,1,7,3,4],[10,11,7,13,14],[5,11,12,13,9],[5,1,2,3,9],[0,6,7,8,4]]; }

function evaluate(grid, table, scatTable){ const pls = getPaylines(); let total=0; let sc=0; grid.forEach(s=>{ if(s && s.isScatter) sc++; }); total += payoutForScatter(scatTable, sc); for(const pl of pls){ const first = grid[pl[0]]; if(!first || first.isScatter) continue; let count=1; for(let i=1;i<pl.length;i++){ const sym = grid[pl[i]]; if(sym && !sym.isScatter && sym.name===first.name) count++; else break; } if(count>=3){ const p = payoutForCount(table, first.name, count); if(p>0) total += p; } } return {win: total, scatter: sc}; }

// simulate with scaling factor applied to payouts
function simulate(spins, scale){ // perform one simulation with current PRNG state
  const table = {}; for(const k in BASE_PAYTABLE){ table[k] = {}; for(const kk in BASE_PAYTABLE[k]) table[k][kk]= BASE_PAYTABLE[k][kk]*scale; }
  const scat = {}; for(const kk in BASE_SCATTER) scat[kk]= BASE_SCATTER[kk]*scale;
  // reset strips (these will be seeded by the current PRNG state)
  reelStrips=null; initReelStrips();
  let totalP=0; const bet=1;
  for(let i=0;i<spins;i++){ const final = buildReelsFinal(); const res = evaluate(final, table, scat); totalP += res.win; }
  return { totalP, rtp: totalP / (spins*bet) };
}

// helper: run N independent trials (re-seed from crypto between trials) and average RTP
function avgSimulate(spins, scale, trials){ let sumRtp=0; for(let t=0;t<trials;t++){ seedFromCrypto(); const res = simulate(spins, scale); sumRtp += res.rtp; } return sumRtp / trials; }

// binary search for scale
async function findScale(){ const trials = 3; let low=0.0001, high=1.0; for(let iter=0;iter<40;iter++){ const pct = avgSimulate(evalSpins, high, trials) * 100; console.log(`probe high ${high.toFixed(6)} -> ${pct.toFixed(4)}%`); if(pct>=target) break; low=high; high *= 1.5; if(high>1e6) break; }
  let best=high; for(let iter=0;iter<30;iter++){ const mid=(low+high)/2; const pct = avgSimulate(evalSpins, mid, trials) * 100; console.log(`bs ${iter} mid=${mid.toFixed(8)} -> ${pct.toFixed(4)}%`); if(pct>=target){ best=mid; high=mid; } else low=mid; }
  return best;
}

(async function main(){ console.log(`Tuning to target ${target}% — eval=${evalSpins} confirm=${confirmSpins}`);
  const scale = await findScale(); console.log(`Found scale ≈ ${scale}`);
  console.log('Confirming...'); const confirm = simulate(confirmSpins, scale);
  console.log(`Confirm RTP ${(confirm.rtp*100).toFixed(4)}% (spins=${confirmSpins})`);
})();
