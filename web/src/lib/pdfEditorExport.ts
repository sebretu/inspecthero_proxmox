import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";

export type PdfSymbol = {
  id: string;
  type: "socket" | "light" | "edv" | "cee" | "special" | "reserve";
  code: string; // The text on the symbol
  x: number;
  y: number;
  rotation: number;
  scale: number;
};

export type PdfText = {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  rotation: number;
};

export interface PdfCutout {
  id: string;
  dataUrl: string;
  originalX: number;
  originalY: number;
  originalWidth: number;
  originalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  isCopy?: boolean;
}

// Funkcja eksportująca wektorowe zmiany na wczytany PDF
export async function exportPdfWithEdits(
  originalPdfBytes: ArrayBuffer,
  symbols: PdfSymbol[],
  texts: PdfText[],
  cutouts: PdfCutout[],
  pdfSize: { width: number; height: number }, // rozmiar renderowanego canvasu
  pageIndex: number = 0
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];
  
  if (!page) {
    throw new Error("Page not found");
  }

  const { width: pWidth, height: pHeight } = page.getSize();
  const rotationAngle = page.getRotation().angle % 360;

  // Funkcja mapująca współrzędne wizualne z canvasu na logiczne PDF-a
  const mapToLogical = (vx: number, vy: number): { x: number, y: number } => {
    const normX = vx / pdfSize.width;
    const normY = vy / pdfSize.height;
    
    if (rotationAngle === 90) {
      return { x: normY * pWidth, y: normX * pHeight };
    } else if (rotationAngle === 180) {
      return { x: pWidth - normX * pWidth, y: normY * pHeight };
    } else if (rotationAngle === 270) {
      return { x: pWidth - normY * pWidth, y: pHeight - normX * pHeight };
    } else {
      // 0 degrees
      return { x: normX * pWidth, y: pHeight - normY * pHeight };
    }
  };

  const getLogicalRect = (vx: number, vy: number, vw: number, vh: number) => {
    const p1 = mapToLogical(vx, vy);
    const p2 = mapToLogical(vx + vw, vy);
    const p3 = mapToLogical(vx, vy + vh);
    const p4 = mapToLogical(vx + vw, vy + vh);
    
    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
    
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  // Skala dla rozmiarów czcionek i obiektów
  const scaleVisualToLogicalX = rotationAngle % 180 === 90 ? pHeight / pdfSize.width : pWidth / pdfSize.width;
  
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Funkcja pomocnicza do konwersji kolorów HEX na RGB
  const hexToRgb = (hex: string) => {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    return rgb(r, g, b);
  };

  // Dodawanie symboli
  symbols.forEach((sym) => {
    const fSize = 8.6 * sym.scale * (pWidth / 595); // Drobna korekta skali
    const txtW = sym.code.length * fSize * 0.55;
    
    let tx = sym.x - (sym.code.length * 4.3 * sym.scale);
    let ty = sym.y + (4.3 * sym.scale);
    
    // Obsługa rotacji symbolu wizualnej (uproszczona)
    if (sym.rotation === 90) {
      tx = sym.x + 4.3 * sym.scale;
      ty = sym.y + txtW / 2;
    } else if (sym.rotation === 270) {
      tx = sym.x - 4.3 * sym.scale;
      ty = sym.y - txtW / 2;
    } else if (sym.rotation === 180) {
      tx = sym.x + txtW / 2;
      ty = sym.y - 4.3 * sym.scale;
    }

    const logicalPos = mapToLogical(tx, ty);

    let txtColor = rgb(0, 0, 0);
    if (sym.type === "socket") txtColor = rgb(220 / 255, 38 / 255, 38 / 255);
    else if (sym.type === "light") txtColor = rgb(217 / 255, 119 / 255, 6 / 255);
    else if (sym.type === "edv") txtColor = rgb(220 / 255, 38 / 255, 38 / 255);
    else if (sym.type === "cee") txtColor = rgb(168 / 255, 85 / 255, 247 / 255);
    else if (sym.type === "special") txtColor = rgb(139 / 255, 92 / 255, 246 / 255);
    else if (sym.type === "reserve") txtColor = rgb(100 / 255, 116 / 255, 139 / 255);

    page.drawText(sym.code, {
      x: logicalPos.x,
      y: logicalPos.y,
      size: fSize,
      font: font,
      color: txtColor,
      rotate: degrees(-rotationAngle - sym.rotation) 
    });
  });

  // Rysowanie zamazujących białych łatek (w miejscach oryginalnego symbolu)
  for (const c of cutouts) {
    if (c.isCopy) continue;
    
    const lRect = getLogicalRect(c.originalX, c.originalY, c.originalWidth, c.originalHeight);

    page.drawRectangle({
      x: lRect.x,
      y: lRect.y,
      width: lRect.width,
      height: lRect.height,
      color: rgb(1, 1, 1), // Biała łatka
    });
  }

  // Rysowanie sklonowanych wycinków (Lasso) w nowym miejscu
  for (const c of cutouts) {
    if (!c.dataUrl) continue;
    
    const base64Data = c.dataUrl.replace(/^data:image\/png;base64,/, "");
    const pngImage = await pdfDoc.embedPng(base64Data);
    
    // Wizualny środek wklejanego elementu
    const vcX = c.x + c.width / 2;
    const vcY = c.y + c.height / 2;
    
    const logicalCenter = mapToLogical(vcX, vcY);
    
    const imageLogicalWidth = rotationAngle % 180 === 90 
      ? (c.width / pdfSize.width) * pHeight 
      : (c.width / pdfSize.width) * pWidth;
      
    const imageLogicalHeight = rotationAngle % 180 === 90 
      ? (c.height / pdfSize.height) * pWidth 
      : (c.height / pdfSize.height) * pHeight;

    const angleDeg = -rotationAngle - c.rotation;
    const theta = (angleDeg * Math.PI) / 180;
    const w2 = imageLogicalWidth / 2;
    const h2 = imageLogicalHeight / 2;
    const rotated_w2 = w2 * Math.cos(theta) - h2 * Math.sin(theta);
    const rotated_h2 = w2 * Math.sin(theta) + h2 * Math.cos(theta);
    
    const drawX = logicalCenter.x - rotated_w2;
    const drawY = logicalCenter.y - rotated_h2;
    
    page.drawImage(pngImage, {
      x: drawX,
      y: drawY,
      width: imageLogicalWidth,
      height: imageLogicalHeight,
      rotate: degrees(angleDeg),
    });
  }

  // Dodawanie swobodnych tekstów
  texts.forEach((txt) => {
    // W react-pdf txt.y to górna krawędź tekstu, w pdf-lib drawText to linia bazowa (dół)
    // Dlatego dodajemy txt.fontSize przed transformacją do współrzędnych logicznych.
    const logicalPos = mapToLogical(txt.x, txt.y + txt.fontSize);
    
    const fSize = txt.fontSize * scaleVisualToLogicalX;

    page.drawText(txt.text, {
      x: logicalPos.x,
      y: logicalPos.y,
      size: fSize,
      font: font,
      color: hexToRgb(txt.color),
      rotate: degrees(-rotationAngle - txt.rotation)
    });
  });

  return await pdfDoc.save();
}
