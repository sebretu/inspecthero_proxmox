import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

function mustInt(name, v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n % 1 !== 0) throw new Error(`${name} must be int`);
  return n;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJsonPretty(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

async function makeBlank(tileSize, outPath) {
  // ✅ blank = białe, NIE przezroczyste (żeby nie było prześwitów i “kratki”)
  const buf = await sharp({
    create: {
      width: tileSize,
      height: tileSize,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png({ palette: false })
    .toBuffer();

  fs.writeFileSync(outPath, buf);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = Object.fromEntries(
    argv.map((a) => {
      const [k, ...rest] = a.split("=");
      return [k.replace(/^--/, ""), rest.join("=")];
    })
  );

  const planId = args.planId;
  const input = args.input;
  if (!planId) throw new Error("Missing --planId=...");
  if (!input) throw new Error("Missing --input=/abs/or/relative/source.png");

  const tileSize = mustInt("tileSize", args.tileSize ?? 256);
  const minZoom = mustInt("minZoom", args.minZoom ?? 1);
  const maxZoom = mustInt("maxZoom", args.maxZoom ?? 5);

  const outBase = path.join(process.cwd(), "public", "tiles", planId);
  ensureDir(outBase);

  // wczytaj źródło (plan jako PNG/JPG itp.)
  const src = sharp(input, { failOn: "none" });
  const meta0 = await src.metadata();
  const srcW = meta0.width;
  const srcH = meta0.height;
  if (!srcW || !srcH) throw new Error("Cannot read image size");

  // grid na maxZoom: ile kafli potrzeba żeby pokryć CAŁY obraz
  const gridW = Math.ceil(srcW / tileSize);
  const gridH = Math.ceil(srcH / tileSize);

  // blank.png
  await makeBlank(tileSize, path.join(outBase, "blank.png"));

  const limits = {};

  for (let z = minZoom; z <= maxZoom; z++) {
    const scaleDown = 2 ** (maxZoom - z);

    const zW = Math.ceil(srcW / scaleDown);
    const zH = Math.ceil(srcH / scaleDown);

    const maxX = Math.ceil(zW / tileSize) - 1;
    const maxY = Math.ceil(zH / tileSize) - 1;
    limits[String(z)] = { maxX, maxY };

    // ✅ klucz: spłaszcz na białe tło BEFORE cięcie kafli (koniec z przezroczystością)
    const zImg = sharp(input, { failOn: "none" })
      .resize(zW, zH, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .ensureAlpha(); // alpha będzie 255 po flatten (opaque)

    for (let x = 0; x <= maxX; x++) {
      for (let y = 0; y <= maxY; y++) {
        const left = x * tileSize;
        const top = y * tileSize;

        const outDir = path.join(outBase, String(z), String(x));
        ensureDir(outDir);

        const outPath = path.join(outDir, `${y}.png`);

        const extractW = Math.min(tileSize, Math.max(0, zW - left));
        const extractH = Math.min(tileSize, Math.max(0, zH - top));

        let tile;
        if (extractW <= 0 || extractH <= 0) {
          // totalnie poza — blank (biały)
          tile = sharp({
            create: {
              width: tileSize,
              height: tileSize,
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            },
          });
        } else {
          tile = zImg
            .clone()
            .extract({ left, top, width: extractW, height: extractH });

          if (extractW !== tileSize || extractH !== tileSize) {
            // ✅ dopełniaj białym, NIE przezroczystym
            tile = tile.extend({
              top: 0,
              left: 0,
              bottom: tileSize - extractH,
              right: tileSize - extractW,
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            });
          }
        }

        const buf = await tile.png({ palette: false }).toBuffer();
        fs.writeFileSync(outPath, buf);
      }
    }

    console.log(`[tiles] z=${z} done (maxX=${maxX}, maxY=${maxY})`);
  }

  const meta = {
    tileSize,
    minZoom,
    maxZoom,
    gridW,
    gridH,
    format: "png",
    limits,
  };

  writeJsonPretty(path.join(outBase, "meta.json"), meta);
  console.log(`[tiles] wrote meta.json => ${path.join(outBase, "meta.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
