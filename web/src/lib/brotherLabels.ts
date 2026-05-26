import QRCode from 'qrcode';
import bwipjs from 'bwip-js';


const DPI_X = 360;
const DPI_Y = 180;
const MM_TO_PX_X = DPI_X / 25.4;
const MM_TO_PX_Y = DPI_Y / 25.4;

export interface BrotherLabelData {
    id: string;
    type: 'cable' | 'trommel' | 'wire';
    index_number?: string | number;
    name: string;
    info?: string;
    tape_width: 18 | 24;
    origin?: string;
}

async function generateBarcodeDataUrl(text: string, is1D: boolean = false): Promise<string> {
    return new Promise((resolve) => {
        try {
            const bcid = is1D ? 'code39' : 'datamatrix';
            const scale = is1D ? 3 : 8;


            if (typeof document === 'undefined') {
                // Server-side logic
                bwipjs.toBuffer({
                    bcid,
                    text: text,
                    scale,
                    includetext: is1D,
                    textsize: 10,
                }, (err, png) => {
                    if (err) {
                        console.error('Barcode generation failed (server)', err);
                        resolve('');
                    } else {
                        resolve(`data:image/png;base64,${png.toString('base64')}`);
                    }
                });
            } else {
                // Client-side logic
                const canvas = document.createElement('canvas');
                bwipjs.toCanvas(canvas, {
                    bcid,
                    text: text,
                    scale,
                    includetext: is1D,
                    textsize: 10,
                });
                resolve(canvas.toDataURL('image/png'));
            }
        } catch (err) {
            console.error('Barcode generation failed', err);
            resolve('');
        }
    });
}




export async function generateBrotherLabelSvg(data: BrotherLabelData): Promise<string> {
    const { id, type, index_number, name, info, tape_width, origin = 'https://inspecthero.app' } = data;
    
    // Physical dimensions in mm
    const h_mm = tape_width;
    
    // Dynamic Width Calculation
    const nameLen = name.length;
    const isCable = type === 'cable' || type === 'wire';
    let w_mm = isCable 
        ? (tape_width === 18 ? 65 : 90) // Even wider base for stretched 1D barcodes
        : (tape_width === 18 ? 40 : 65);


    
    // Aggressive expansion logic to reach up to 100mm
    const expansionThreshold = 12; // Start expanding earlier
    if (nameLen > expansionThreshold) {
        w_mm = Math.min(100, w_mm + (nameLen - expansionThreshold) * 2.5);
    }
    
    // UNIFORM Standard DPI (300 DPI)
    const DPI = 300;
    const h_px = Math.round(h_mm * (DPI / 25.4));
    const w_px = Math.round(w_mm * (DPI / 25.4));
    
    const accentColor = type === 'cable' ? '#3b82f6' : type === 'trommel' ? '#f59e0b' : '#10b981';
    const accentWidth = (type === 'cable' || type === 'wire') ? 0 : 2.5; // mm
    
    const qrSizeMm = isCable 
        ? (tape_width === 18 ? 10 : 16) 
        : (tape_width === 18 ? 12 : 18); 
    const barcodeWidth = isCable ? qrSizeMm * 3.0 : qrSizeMm; // 3x width for Code 39

        
    const qrX = accentWidth + (isCable ? 1.5 : 1.5); // Move even further left for cables
    const qrY = isCable ? 4.0 : 3.0; // Centered vertically





    // Text (Right side)
    const textX = isCable 
        ? (tape_width === 18 ? 30.0 : 45.0) // Shifted significantly right to avoid giant number
        : (qrX + barcodeWidth + 7.0); 



    
    // Safe Font Sizes
    const indexSize = tape_width === 18 ? 3.0 : 5.0; // mm
    const titleSize = tape_width === 18 ? 2.5 : 4.0; 
    const subSize = tape_width === 18 ? 3.0 : 4.0; // 2x bigger as requested (from 1.5/2.0)


    // Text Wrapping Logic for Name
    let nameLines = [name];
    if (tape_width === 24 && name.length > 15) {
        const words = name.split(' ');
        if (words.length > 1) {
            const mid = Math.ceil(words.length / 2);
            nameLines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
        } else {
            nameLines = [name.substring(0, 15), name.substring(15)];
        }
    }

    // RECONSTRUCT URL / IDENTIFIER
    const scanType = type === 'trommel' ? 'trommel' : 'cable';
    const qrUrl = `${origin}/cables?scan_type=${scanType}&scan_id=${id}&name=${encodeURIComponent(name)}&index_number=${index_number || ""}`;

    
    let qrDataUrl = '';
    if (isCable) {
        // Use 1D Barcode (Code 128) for cables for better readability on curved surfaces
        // Format: CBL-IndexNumber (or ID if no index)
        const identifier = index_number ? `CBL-${index_number}` : `CBL-${id.substring(0, 8)}`;
        qrDataUrl = await generateBarcodeDataUrl(identifier, true);
    } else {
        // Keep QR Code for trommels
        qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 800 });
    }



    return `<svg width="${w_mm}mm" height="${h_mm}mm" viewBox="0 0 ${w_mm} ${h_mm}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${w_mm}" height="${h_mm}" fill="white" />
  ${accentWidth > 0 ? `<rect x="0" y="0" width="${accentWidth}" height="${h_mm}" fill="${accentColor}" />` : ''}
  
  ${isCable ? `
    <!-- BIGGER INDEX NUMBER FOR CABLES -->
    <text x="${qrX}" y="${h_mm * 0.70}" font-family="sans-serif" font-size="${tape_width === 18 ? 12 : 18}" font-weight="900" fill="#000000">
      ${index_number || ''}
    </text>


  ` : `
    <image x="${qrX}" y="${qrY}" width="${barcodeWidth}" height="${qrSizeMm}" href="${qrDataUrl}" />
  `}


  <!-- Index Number (Small one, removed if big one is present to avoid redundancy) -->
  ${!isCable && index_number ? `
    <text x="${textX}" y="${h_mm * 0.15}" font-family="sans-serif" font-size="${indexSize}" font-weight="900" fill="#000000">
      #${index_number}
    </text>
  ` : ''}


  
  <!-- Multi-line Name -->
  ${nameLines.map((line, i) => `
    <text x="${textX}" y="${h_mm * (nameLines.length === 1 ? 0.45 : (0.35 + i * 0.20))}" font-family="sans-serif" font-size="${titleSize}" font-weight="bold" fill="#000000">
      ${line}
    </text>
  `).join('')}

  
  <!-- Info Line -->
  <text x="${textX}" y="${h_mm * 0.75}" font-family="sans-serif" font-size="${subSize}" font-weight="bold" fill="#000000">
    ${info || ''}
  </text>

</svg>`.trim();
}
