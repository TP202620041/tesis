#!/usr/bin/env node
/**
 * Genera los iconos de la PWA a partir de sus dos fuentes SVG (DEP-06).
 *
 *   public/icons/icono.svg           -> icon-192.png, icon-512.png (purpose `any`)
 *                                       y src/app/favicon.ico (16, 32 y 48 px)
 *   public/icons/icono-maskable.svg  -> icon-maskable-192.png, icon-maskable-512.png
 *                                       (purpose `maskable`) y src/app/apple-icon.png
 *   public/icons/icono-badge.svg     -> badge-96.png (insignia monocroma de los
 *                                       avisos push, ver src/pwa/avisosPush.ts)
 *
 * Los iconos actuales son PROVISIONALES: cuando llegue la identidad visual
 * definitiva basta con reemplazar los SVG y correr `node scripts/generar-iconos.mjs`.
 * Los PNG y el ICO resultantes se versionan; no se generan en el build.
 *
 * Usa `sharp`, que ya instala Next como dependencia opcional (lo usa para
 * optimizar imagenes): no se agrega ninguna dependencia al package.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';

const RAIZ = resolve(import.meta.dirname, '..');
const ICONOS = join(RAIZ, 'public', 'icons');
const APP = join(RAIZ, 'src', 'app');

const svgAny = readFileSync(join(ICONOS, 'icono.svg'));
const svgMaskable = readFileSync(join(ICONOS, 'icono-maskable.svg'));
const svgBadge = readFileSync(join(ICONOS, 'icono-badge.svg'));

/**
 * Rasteriza a 1024 px (densidad 144 sobre un lienzo de 512) y reduce: los
 * bordes salen mejor suavizados que rasterizando directo a 16 o 32 px.
 */
function png(svg, lado) {
  return sharp(svg, { density: 144 })
    .resize(lado, lado, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO con las imagenes embebidas como PNG (lo admite todo navegador actual). */
function ico(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // tipo: icono
  cabecera.writeUInt16LE(imagenes.length, 4);
  let offset = cabecera.length + 16 * imagenes.length;
  const entradas = imagenes.map(({ lado, datos }) => {
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(lado >= 256 ? 0 : lado, 0); // ancho (0 = 256)
    entrada.writeUInt8(lado >= 256 ? 0 : lado, 1); // alto
    entrada.writeUInt16LE(1, 4); // planos
    entrada.writeUInt16LE(32, 6); // bits por pixel
    entrada.writeUInt32LE(datos.length, 8);
    entrada.writeUInt32LE(offset, 12);
    offset += datos.length;
    return entrada;
  });
  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.datos)]);
}

function escribir(destino, datos, detalle) {
  writeFileSync(destino, datos);
  console.log(`${relative(RAIZ, destino).replaceAll('\\', '/')}  ${detalle}  ${datos.length} B`);
}

const pngs = [
  [svgAny, 192, join(ICONOS, 'icon-192.png')],
  [svgAny, 512, join(ICONOS, 'icon-512.png')],
  [svgMaskable, 192, join(ICONOS, 'icon-maskable-192.png')],
  [svgMaskable, 512, join(ICONOS, 'icon-maskable-512.png')],
  // iOS rellena de negro la transparencia y redondea las esquinas por su
  // cuenta: el apple-touch-icon va opaco y a sangre, como la variante maskable.
  [svgMaskable, 180, join(APP, 'apple-icon.png')],
  // 96 px = 24 dp a densidad 4x, el tamano que Android pinta en la barra de estado.
  [svgBadge, 96, join(ICONOS, 'badge-96.png')],
];
for (const [svg, lado, destino] of pngs) {
  escribir(destino, await png(svg, lado), `${lado}x${lado}`);
}

const LADOS_ICO = [16, 32, 48];
const imagenesIco = [];
for (const lado of LADOS_ICO) imagenesIco.push({ lado, datos: await png(svgAny, lado) });
escribir(join(APP, 'favicon.ico'), ico(imagenesIco), LADOS_ICO.join('/'));
