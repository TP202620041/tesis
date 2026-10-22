// Contraste WCAG 2.x de los pares de tokens de cada dirección. Uso: node contraste.mjs
const lum = h => { const c = h.replace('#',''); const v = [0,2,4].map(i => parseInt(c.slice(i,i+2),16)/255).map(x => x <= 0.04045 ? x/12.92 : ((x+0.055)/1.055)**2.4); return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]; };
export const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const T = JSON.parse(process.argv[2] ? (await import('node:fs')).readFileSync(process.argv[2],'utf8') : '{}');
let fallos = 0;
for (const [grupo, pares] of Object.entries(T)) {
  console.log(`\n## ${grupo}`);
  for (const [nombre, fg, bg, min] of pares) {
    const r = ratio(fg, bg); const ok = r >= min; if (!ok) fallos++;
    console.log(`${ok ? 'OK ' : 'FALLA'} ${r.toFixed(2).padStart(6)}:1 (mín ${min})  ${nombre}  ${fg} / ${bg}`);
  }
}
console.log(`\nFallos: ${fallos}`);
