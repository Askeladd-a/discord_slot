// simulate_compute_scale.js
// Compute baseline RTP for the Reels engine with a known PAYTABLE, then compute a scale factor to reach target RTP
// Usage: node simulate_compute_scale.js --spins 200000 --target 97 --seed <hex>

const crypto = require('crypto');
const argv = process.argv.slice(2);
let spins = 200000; let target = 97; let seedHex = null;
for(let i=0;i<argv.length;i++){
  if(argv[i]==='--spins' && argv[i+1]){ spins = Number(argv[i+1]); i++; }
  else if(argv[i]==='--target' && argv[i+1]){ target = Number(argv[i+1]); i++; }
  else if(argv[i]==='--seed' && argv[i+1]){ seedHex = argv[i+1]; i++; }
}

// PRNG xoshiro128++
let s = new Uint32Array(4);
function rotl(x,k){ return ((x<<k) | (x>>> (32-k))) >>> 0; }
function next(){ const result = (rotl((s[0] + s[3])>>>0, 7) + s[0]) >>> 0; const t = (s[1] << 9) >>> 0; s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11); return result / 0x100000000; }
function seedFromHex(h){ const hh = (h||'').replace(/[^0-9a-fA-F]/g,'').padEnd(32,'0').slice(0,32); const buf = Buffer.from(hh,'hex'); for(let i=0;i<4;i++) s[i]=buf.readUInt32LE(i*4); }
function seedFromCrypto(){ const buf = crypto.randomBytes(16); for(let i=0;i<4;i++) s[i]=buf.readUInt32LE(i*4); }
if(seedHex) seedFromHex(seedHex); else seedFromCrypto(); function rng(){ return next(); }

// Game definitions matching index.html base values
const ROWS=3, COLS=5;
const SYMBOLS = []; for(let i=1;i<=13;i++) SYMBOLS.push({name:'S'+i});
const SCATTER = {name:'ZEUS', isScatter:true};
const WEIGHTED=[]; for(let i=0;i<SYMBOLS.length;i++) WEIGHTED.push({sym:SYMBOLS[i], weight: 12 - i}); WEIGHTED.push({sym:SCATTER, weight:2});

const BASE_PAYTABLE = {
  S1: {5:100,4:50,3:20}, S2: {5:50,4:20,3:5}, S3: {5:30,4:10,3:4},
  S4: {5:24,4:4,3:3}, S5: {5:20,4:3,3:2}, S6: {5:16,4:2.4,3:1.6},
  S7: {5:10,4:2,3:1}, S8: {5:8,4:1.8,3:0.8}, S9: {5:4,4:1.5,3:0.5},
  S10:{5:4,4:1.5,3:0.5}, S11:{5:4,4:1.5,3:0.5}, S12:{5:4,4:1.5,3:0.5}
};
const BASE_SCATTER = {5:200,4:100,3:6};

const REEL_STRIP_LEN = 64;
function initReelStrips(){ const strips=[]; for(let c=0;c<COLS;c++){ const strip=[]; for(let i=0;i<REEL_STRIP_LEN;i++){ const w=WEIGHTED[Math.floor(rng()*WEIGHTED.length)]; strip.push(w.sym); } strips.push(strip);} return strips; }
function buildFinalFromStrips(strips){ const final = Array(ROWS*COLS).fill(null); for(let c=0;c<COLS;c++){ const strip = strips[c]; const start = Math.floor(rng()*strip.length); for(let r=0;r<ROWS;r++) final[r*COLS + c] = strip[(start + r) % strip.length]; } return final; }

function payoutForCount(table,name,count){ const t = table[name]; if(!t) return 0; const keys = Object.keys(t).map(Number).sort((a,b)=>a-b); let m=0; for(const k of keys) if(count>=k) m=k; return m? t[m] : 0; }
function payoutForScatter(table,count){ if(count>=5) return table[5]||0; if(count>=4) return table[4]||0; if(count>=3) return table[3]||0; return 0; }
function getPaylines(){ return [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[0,6,12,8,4],[10,6,2,8,14],[0,1,7,3,4],[10,11,7,13,14],[5,11,12,13,9],[5,1,2,3,9],[0,6,7,8,4]]; }

function evaluateGrid(grid, table, scat){ let total=0; let sc=0; grid.forEach(s=>{ if(s && s.isScatter) sc++; }); total += payoutForScatter(scat, sc); const pls = getPaylines(); for(const pl of pls){ const first = grid[pl[0]]; if(!first || first.isScatter) continue; let count=1; for(let i=1;i<pl.length;i++){ const sym = grid[pl[i]]; if(sym && !sym.isScatter && sym.name===first.name) count++; else break; } if(count>=3){ total += payoutForCount(table, first.name, count); } } return total; }

function simulateOnce(scale){ const table = {}; for(const k in BASE_PAYTABLE){ table[k] = {}; for(const kk in BASE_PAYTABLE[k]) table[k][kk] = BASE_PAYTABLE[k][kk] * scale; } const scat = {}; for(const kk in BASE_SCATTER) scat[kk] = BASE_SCATTER[kk] * scale; const strips = initReelStrips(); const final = buildFinalFromStrips(strips); return evaluateGrid(final, table, scat); }

function estimateRtp(spins, scale){ let sum=0; for(let i=0;i<spins;i++){ sum += simulateOnce(scale); } return sum / spins; }

(async function main(){ console.log(`Estimating baseline RTP with ${spins} spins...`);
  const baseline = estimateRtp(spins, 1.0);
  const baselinePct = baseline * 100; // bet=1
  console.log(`Baseline mean payout: ${baseline.toFixed(6)} → RTP=${baselinePct.toFixed(4)}%`);
  const desired = target/100;
  const factor = desired / baseline;
  console.log(`Scale factor to reach ${target}% ≈ ${factor.toFixed(6)}`);
  // print scaled table for inspection
  const scaled = {};
  for(const k in BASE_PAYTABLE){ scaled[k] = {}; for(const kk in BASE_PAYTABLE[k]) scaled[k][kk] = +(BASE_PAYTABLE[k][kk]*factor).toFixed(6); }
  const scaledScatter = {}; for(const kk in BASE_SCATTER) scaledScatter[kk] = +(BASE_SCATTER[kk]*factor).toFixed(6);
  console.log('Scaled PAYTABLE:', JSON.stringify(scaled, null, 2));
  console.log('Scaled SCATTER_PAYOUT:', JSON.stringify(scaledScatter, null, 2));
})();
