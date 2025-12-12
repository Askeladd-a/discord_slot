const fs = require('fs');
const vm = require('vm');
const path = require('path');

function extractObjectLiteral(src, name){
  const idx = src.indexOf(`const ${name}`);
  if(idx<0) return null;
  const start = src.indexOf('{', idx);
  if(start<0) return null;
  let depth=0; let end=-1;
  for(let i=start;i<src.length;i++){
    const ch = src[i];
    if(ch==='{') depth++; else if(ch==='}') { depth--; if(depth===0){ end = i; break; } }
  }
  if(end<0) return null;
  const literal = src.slice(start, end+1);
  return {start, end, literal};
}

function parseLiteral(lit){
  // wrap in parentheses to evaluate as expression
  const code = '(' + lit + ')';
  return vm.runInNewContext(code, {});
}

function stringifyObject(obj){
  // simple stringify with numeric formatting
  function fmt(v){ if(typeof v === 'number') return Number(v.toFixed(6)); return v; }
  function rec(o, indent='  '){
    if(typeof o !== 'object' || o === null) return String(o);
    const keys = Object.keys(o);
    const parts = keys.map(k => `${k}: ${typeof o[k] === 'object' ? rec(o[k], indent+'  ') : fmt(o[k])}`);
    return '{\n' + parts.map(p=> indent + p).join(',\n') + '\n}';
  }
  return rec(obj);
}

function scaleObject(obj, factor){
  const out = Array.isArray(obj) ? [] : {};
  for(const k of Object.keys(obj)){
    const v = obj[k];
    if(typeof v === 'number') out[k] = v * factor;
    else if(typeof v === 'object' && v !== null) out[k] = scaleObject(v, factor);
    else out[k] = v;
  }
  return out;
}

function applyScaleToFile(filePath, factor){
  const src = fs.readFileSync(filePath,'utf8');
  const names = ['PAYTABLE','SCATTER_PAYOUT'];
  let out = src; let delta = 0;
  for(const name of names){
    const found = extractObjectLiteral(out, name);
    if(!found) continue;
    const obj = parseLiteral(found.literal);
    const scaled = scaleObject(obj, factor);
    const replacement = ' ' + JSON.stringify(scaled, null, 2).replace(/"([A-Za-z0-9_$]+)":/g,'$1:').replace(/"/g,'');
    // better: custom stringify to keep numbers plain
    const custom = stringifyObject(scaled);
    out = out.slice(0, found.start + delta) + custom + out.slice(found.end + 1 + delta);
    delta = out.length - src.length;
  }
  fs.writeFileSync(filePath, out, 'utf8');
  console.log(`Updated ${filePath} with factor ${factor}`);
}

// CLI
const args = process.argv.slice(2);
if(args.length < 2){
  console.error('Usage: node scale_paytables.js <factor> <file1> [file2 ...]'); process.exit(2);
}
const factor = Number(args[0]); if(!isFinite(factor)) { console.error('Invalid factor'); process.exit(2); }
const files = args.slice(1).map(f=> path.resolve(f));
for(const f of files) applyScaleToFile(f, factor);
