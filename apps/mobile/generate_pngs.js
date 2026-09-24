const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

// CRC32 helper
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}
function calcCrc(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const combined = Buffer.concat([typeBuf, data]);
  const crcVal = calcCrc(combined);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, combined, crcBuf]);
}

function encodePng(width, height, getPixel) {
  const rowLen = width * 4 + 1;
  const rawData = Buffer.alloc(rowLen * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = makeChunk('IHDR', ihdrData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

// Generate et4u high-res official Icon matching the reference:
// Dark squircle background (#12161E), bold white 'e' on left, glowing yellow electric bolt on right.
function getIconPixel(x, y, w, h) {
  const nx = (x / w) * 100;
  const ny = (y / h) * 100;

  // Background dark gradient & rounded squircle
  const cx = nx - 50;
  const cy = ny - 50;
  const dist = Math.pow(Math.abs(cx) / 46, 5) + Math.pow(Math.abs(cy) / 46, 5);
  
  if (dist > 1.05) {
    return [0, 0, 0, 0]; // Transparent outside squircle
  }

  // Base background dark graphite
  let bgR = 14 + Math.round((1 - (ny / 100)) * 12);
  let bgG = 18 + Math.round((1 - (ny / 100)) * 12);
  let bgB = 24 + Math.round((1 - (ny / 100)) * 14);

  // Squircle edge border highlight
  if (dist > 0.95 && dist <= 1.05) {
    const alphaEdge = (1.05 - dist) / 0.1;
    bgR = Math.round(bgR * 0.5 + 80 * alphaEdge);
    bgG = Math.round(bgG * 0.5 + 85 * alphaEdge);
    bgB = Math.round(bgB * 0.5 + 95 * alphaEdge);
  }

  // Lightning Bolt & Glow coordinates (Right side: center ~ nx: 64, ny: 48)
  const ldx = nx - 64;
  const ldy = ny - 48;
  const lDist = Math.sqrt(ldx * ldx + ldy * ldy);

  // Ambient electric yellow glow
  if (lDist < 42) {
    const glowIntensity = Math.pow(Math.max(0, 1 - (lDist / 42)), 2) * 0.85;
    bgR = Math.min(255, bgR + Math.round(255 * glowIntensity * 0.9));
    bgG = Math.min(255, bgG + Math.round(230 * glowIntensity * 0.9));
    bgB = Math.min(255, bgB + Math.round(20 * glowIntensity * 0.2));
  }

  // 1. Render Lightning Bolt polygon (Right side)
  // Polygon vertices normalized 0-100:
  // V1(68, 17) -> V2(43, 49) -> V3(62, 49) -> V4(59, 79) -> V5(85, 43) -> V6(65, 43) -> V1(68, 17)
  const boltPoly = [
    [68, 17], [43, 49], [63, 49], [59, 79], [86, 43], [65, 43]
  ];
  
  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const inBolt = pointInPoly(nx, ny, boltPoly);
  if (inBolt) {
    // Yellow core with slight gradient
    const yellowR = 255;
    const yellowG = 238;
    const yellowB = 0;
    return [yellowR, yellowG, yellowB, 255];
  }

  // 2. Render Letter 'e' (Left side: nx: 18..44, ny: 35..68)
  const ex = nx - 31;
  const ey = ny - 52;
  // Elliptical outer radius
  const eOuter = (ex * ex) / (13 * 13) + (ey * ey) / (15 * 15);
  const eInner = (ex * ex) / (7.5 * 7.5) + (ey * ey) / (8.5 * 8.5);

  // Letter 'e' shape logic
  if (eOuter <= 1.0) {
    const isBar = Math.abs(ey - 0.5) < 3.2 && ex >= -11 && ex <= 11;
    const isHole = (eInner < 1.0) && (ey < 0);
    const isOpenMouth = (ey > 2 && ey < 9 && ex > 2);

    if (isBar || (!isHole && !isOpenMouth)) {
      return [255, 255, 255, 255]; // Crisp bold white 'e'
    }
  }

  return [bgR, bgG, bgB, 255];
}

console.log('Generating official et4u icons and splash...');
const iconPng = encodePng(1024, 1024, getIconPixel);
const splashPng = encodePng(1242, 2436, (x, y, w, h) => {
  // Center the logo in splash
  const scale = 0.5;
  const offsetX = (w - w * scale) / 2;
  const offsetY = (h - h * scale) / 2;
  if (x >= offsetX && x < offsetX + w * scale && y >= offsetY && y < offsetY + h * scale) {
    const localX = (x - offsetX) / scale;
    const localY = (y - offsetY) / scale;
    return getIconPixel(localX, localY, w, h);
  }
  return [10, 14, 20, 255]; // Background dark space
});

fs.writeFileSync(path.join(assetsDir, 'icon.png'), iconPng);
fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), iconPng);
fs.writeFileSync(path.join(assetsDir, 'splash.png'), splashPng);

console.log('Successfully generated official et4u icon.png, adaptive-icon.png, and splash.png!');
