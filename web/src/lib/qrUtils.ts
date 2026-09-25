import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

export const generateQrBase64 = async (text: string): Promise<string> => {
    try {
        return await QRCode.toDataURL(text, {
            margin: 4,
            width: 200,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
        });
    } catch (err) {
        console.error('QR generation failed', err);
        return '';
    }
};

export const generateDataMatrixBase64 = async (text: string): Promise<string> => {
    return new Promise((resolve) => {
        try {
            if (typeof document === 'undefined') {
                // Server-side
                bwipjs.toBuffer({
                    bcid: 'datamatrix',
                    text: text,
                    scale: 3,
                    includetext: false,
                }, (err, png) => {
                    if (err) {
                        console.error('DataMatrix generation failed (server)', err);
                        resolve('');
                    } else {
                        resolve(`data:image/png;base64,${png.toString('base64')}`);
                    }
                });
            } else {
                // Client-side
                const canvas = document.createElement('canvas');
                bwipjs.toCanvas(canvas, {
                    bcid: 'datamatrix',
                    text: text,
                    scale: 3,
                    includetext: false,
                });
                resolve(canvas.toDataURL('image/png'));
            }
        } catch (err) {
            console.error('DataMatrix generation failed', err);
            resolve('');
        }
    });
};


