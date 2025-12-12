// simulate_reels.js
// Simple Node Monte-Carlo for the Reels (5x3) mode from index.html
// Usage: node simulate_reels.js --spins 100000 --seed <32hex>

const crypto = require('crypto');

// --- CLI parsing (tiny)
const argv = process.argv.slice(2);
let spins = 100000; let seedHex = null;
for(let i=0;i<argv.length;i++){
  if(argv[i]==='--spins' && argv[i+1]){ spins = parseInt(argv[i+1],10); i++; }
  else if(argv[i]==='--seed' && argv[i+1]){ seedHex = argv[i+1]; i++; }
}
if(!Number.isFinite(spins) || spins<=0) spins = 100000;

// --- PRNG xoshiro128++ (same algorithm as client)
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
  const h = (hex||'').replace(/[^0-9a-fA-F]/g,'').padEnd(32,'0').slice(0,32);
  const bytes = Buffer.from(h, 'hex');
  for(let i=0;i<4;i++) s[i] = bytes.readUInt32LE(i*4);
}
function seedFromCrypto(){ const buf = crypto.randomBytes(16); for(let i=0;i<4;i++) s[i] = buf.readUInt32LE(i*4); }

if(seedHex) seedFromHex(seedHex); else seedFromCrypto();

function rng(){ return next(); }

// --- Game params (match index.html)
const ROWS = 3, COLS = 5, TOTAL = ROWS*COLS;
const SYMBOLS = [];
for(let i=1;i<=13;i++) SYMBOLS.push({name:'S'+i});
const SCATTER = {name:'ZEUS', isScatter:true};
const WEIGHTED = [];
for(let i=0;i<SYMBOLS.length;i++) WEIGHTED.push({sym: SYMBOLS[i], weight: 12 - i});
WEIGHTED.push({sym: SCATTER, weight:2});

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
const SCATTER_PAYOUT = {6:200,5:100,4:6};

function payoutForCount(name,count){
  const table = PAYTABLE[name]; if(!table) return 0;
  const keys = Object.keys(table).map(Number).sort((a,b)=>a-b);
  let matched = 0; for(const k of keys) if(count>=k) matched=k;
  return matched? table[matched]:0;
}
function payoutForScatter(count){ if(count>=6) return SCATTER_PAYOUT[6]||0; if(count>=5) return SCATTER_PAYOUT[5]||0; if(count>=4) return SCATTER_PAYOUT[4]||0; return 0; }

// --- Reel strips deterministic init
const REEL_STRIP_LEN = 64; let reelStrips = null;
function initReelStrips(){ reelStrips = []; for(let r=0;r<COLS;r++){ const strip = []; for(let i=0;i<REEL_STRIP_LEN;i++){ const w = WEIGHTED[Math.floor(rng()*WEIGHTED.length)]; strip.push(w.sym); } reelStrips.push(strip); } }
function buildReelsFinal(){ if(!reelStrips) initReelStrips(); const final = Array(ROWS*COLS).fill(null); for(let c=0;c<COLS;c++){ const strip = reelStrips[c]; const start = Math.floor(rng()*strip.length); for(let r=0;r<ROWS;r++) final[r*COLS + c] = strip[(start + r) % strip.length]; } return final; }

function getPaylines(){
  return [
    [0,1,2,3,4],
    [5,6,7,8,9],
    [10,11,12,13,14],
    [0,6,12,8,4],
    [10,6,2,8,14],
    [0,1,7,3,4],
    [10,11,7,13,14],
    [5,11,12,13,9],
    [5,1,2,3,9],
    [0,6,7,8,4]
  ];
}

function evaluateReels(grid){
  const paylines = getPaylines(); let total=0; let scatterCount=0; const wins=[];
  grid.forEach(s=>{ if(s && s.isScatter) scatterCount++; });
  total += payoutForScatter(scatterCount);
  for(const pl of paylines){ const first = grid[pl[0]]; if(!first || first.isScatter) continue; let count=1; for(let i=1;i<pl.length;i++){ const sym = grid[pl[i]]; if(sym && !sym.isScatter && sym.name===first.name) count++; else break; } if(count>=3){ const p = payoutForCount(first.name,count); if(p>0){ total += p; wins.push({line:pl, symbol:first.name, count, payout:p}); } } }
  return {win:total, wins, scatterCount};
}

// --- run
const bet = 1.0; let totalBet = 0; let totalPayout = 0;
initReelStrips(); // create strips for seed

for(let i=0;i<spins;i++){
  totalBet += bet;
  const final = buildReelsFinal();
  const res = evaluateReels(final);
  totalPayout += res.win;
}

const rtp = totalPayout / totalBet;
console.log(`spins=${spins} seed=${seedHex||'(random)'} totalBet=${totalBet.toFixed(2)} totalPayout=${totalPayout.toFixed(2)} RTP=${(rtp*100).toFixed(4)}%`);

process.exit(0);
