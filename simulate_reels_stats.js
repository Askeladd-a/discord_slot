// simulate_reels_stats.js
// Monte-Carlo simulator that reports mean, std, stderr and 95% CI for the Reels mode
// Usage: node simulate_reels_stats.js --spins 100000 --seed <32hex>

const crypto = require('crypto');

// CLI parsing
const argv = process.argv.slice(2);
let spins = 100000; let seedHex = null;
for(let i=0;i<argv.length;i++){
  if(argv[i]==='--spins' && argv[i+1]){ spins = parseInt(argv[i+1],10); i++; }
  else if(argv[i]==='--seed' && argv[i+1]){ seedHex = argv[i+1]; i++; }
}
if(!Number.isFinite(spins) || spins<=0) spins = 100000;

// PRNG xoshiro128++ (same as client)
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
  const buf = Buffer.from(h,'hex');
  for(let i=0;i<4;i++) s[i] = buf.readUInt32LE(i*4);
}
function seedFromCrypto(){ const buf = crypto.randomBytes(16); for(let i=0;i<4;i++) s[i] = buf.readUInt32LE(i*4); }
if(seedHex) seedFromHex(seedHex); else seedFromCrypto();
function rng(){ return next(); }

// Game params
const ROWS = 3, COLS = 5;
const SYMBOLS = [];
for(let i=1;i<=13;i++) SYMBOLS.push({name:'S'+i});
const SCATTER = {name:'ZEUS', isScatter:true};
const WEIGHTED = [];
for(let i=0;i<SYMBOLS.length;i++) WEIGHTED.push({sym: SYMBOLS[i], weight: 12 - i});
WEIGHTED.push({sym: SCATTER, weight:2});

const PAYTABLE = {
  S1: {5: 20.067217, 4: 10.109816, 3: 4.012677},
  S2: {5: 10.109816, 4: 4.012677,  3: 1.003199},
  S3: {5: 6.016082,  4: 2.006371,  3: 0.802103},
  S4: {5: 4.815525,  4: 0.802103,  3: 0.601119},
  S5: {5: 4.012677,  4: 0.601119,  3: 0.400932},
  S6: {5: 3.208627,  4: 0.481053,  3: 0.320881},
  S7: {5: 2.006371,  4: 0.400932,  3: 0.200745},
  S8: {5: 1.605379,  4: 0.361089,  3: 0.160500},
  S9: {5: 0.802103,  4: 0.300886,  3: 0.100415},
  S10:{5: 0.802103,  4: 0.300886,  3: 0.100415}, S11:{5: 0.802103,  4: 0.300886,  3: 0.100415}, S12:{5: 0.802103,  4: 0.300886,  3: 0.100415}
};
const SCATTER_PAYOUT = {5:40.135120,4:20.067560,3:1.203889};
function payoutForCount(name,count){ const table = PAYTABLE[name]; if(!table) return 0; const keys = Object.keys(table).map(Number).sort((a,b)=>a-b); let m=0; for(const k of keys) if(count>=k) m=k; return m?table[m]:0; }
function payoutForScatter(count){ if(count>=6) return SCATTER_PAYOUT[6]||0; if(count>=5) return SCATTER_PAYOUT[5]||0; if(count>=4) return SCATTER_PAYOUT[4]||0; return 0; }

// reels
const REEL_STRIP_LEN = 64; let reelStrips = null;
function initReelStrips(){ reelStrips=[]; for(let r=0;r<COLS;r++){ const strip=[]; for(let i=0;i<REEL_STRIP_LEN;i++){ const w = WEIGHTED[Math.floor(rng()*WEIGHTED.length)]; strip.push(w.sym); } reelStrips.push(strip); } }
function buildReelsFinal(){ if(!reelStrips) initReelStrips(); const final = Array(ROWS*COLS).fill(null); for(let c=0;c<COLS;c++){ const strip = reelStrips[c]; const start = Math.floor(rng()*strip.length); for(let r=0;r<ROWS;r++) final[r*COLS + c] = strip[(start + r) % strip.length]; } return final; }
function getPaylines(){ return [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[0,6,12,8,4],[10,6,2,8,14],[0,1,7,3,4],[10,11,7,13,14],[5,11,12,13,9],[5,1,2,3,9],[0,6,7,8,4]]; }
function evaluateReels(grid){ const pls=getPaylines(); let total=0; let sc=0; const wins=[]; grid.forEach(s=>{ if(s && s.isScatter) sc++; }); total += payoutForScatter(sc); for(const pl of pls){ const first = grid[pl[0]]; if(!first || first.isScatter) continue; let count=1; for(let i=1;i<pl.length;i++){ const sym = grid[pl[i]]; if(sym && !sym.isScatter && sym.name===first.name) count++; else break; } if(count>=3){ const p=payoutForCount(first.name,count); if(p>0){ total += p; wins.push({line:pl,symbol:first.name,count,payout:p}); } } } return {win:total,wins,scatterCount:sc}; }

// stats: Welford
let n=0; let mean=0; let M2=0; let minP=Infinity; let maxP=-Infinity; let totalPayout=0;
const bet = 1.0;
initReelStrips();
for(let i=0;i<spins;i++){
  const final = buildReelsFinal();
  const res = evaluateReels(final);
  const payout = res.win;
  n++;
  const delta = payout - mean; mean += delta / n; M2 += delta * (payout - mean);
  totalPayout += payout;
  if(payout<minP) minP=payout; if(payout>maxP) maxP=payout;
}
const variance = n>1 ? M2/(n-1) : 0; const sd = Math.sqrt(variance); const stderr = sd/Math.sqrt(n);
const meanPayout = mean; const rtp = meanPayout / bet; const ciLow = (meanPayout - 1.96*stderr)/bet; const ciHigh = (meanPayout + 1.96*stderr)/bet;

console.log(`spins=${spins} seed=${seedHex||'(random)'} totalBet=${(n*bet).toFixed(2)} totalPayout=${totalPayout.toFixed(2)} meanPayout=${meanPayout.toFixed(6)} sd=${sd.toFixed(6)} stderr=${stderr.toFixed(6)}`);
console.log(`RTP=${(rtp*100).toFixed(4)}% 95%CI=[${(ciLow*100).toFixed(4)}%, ${(ciHigh*100).toFixed(4)}%]`);

process.exit(0);
