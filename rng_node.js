// rng_node.js - xoshiro128++ PRNG for Node
const crypto = require('crypto');
function seedState(){
  const buf = crypto.randomBytes(16);
  const s = new Uint32Array(4);
  for(let i=0;i<4;i++) s[i] = buf.readUInt32LE(i*4);
  return s;
}
function rotl(x,k){ return ((x<<k) | (x>>> (32-k))) >>> 0; }
function makeRng(){
  const s = seedState();
  function next(){
    const result = (rotl((s[0] + s[3])>>>0, 7) + s[0]) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = rotl(s[3], 11);
    return result / 0x100000000;
  }
  return {next};
}
module.exports = makeRng();
