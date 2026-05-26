import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { generateBrotherLabelSvg, BrotherLabelData } from '@/lib/brotherLabels';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { items, tape_width } = body; // Expecting an array of labels or single

        if (!items || !Array.isArray(items)) {
            return NextResponse.json({ error: 'Missing items array' }, { status: 400 });
        }

        const results = await Promise.all(items.map(async (item: any) => {
            const svg = await generateBrotherLabelSvg({
                ...item,
                tape_width: tape_width || 18
            });

            // Calculate dynamic width based on name length
            let w_mm = tape_width === 18 ? 40 : 65;
            const nameLen = (item.name || "").length;
            const expansionThreshold = 12;
            if (nameLen > expansionThreshold) {
                w_mm = Math.min(100, w_mm + (nameLen - expansionThreshold) * 2.5);
            }

            const pngBuffer = await sharp(Buffer.from(svg), { density: 300 })
                .png()
                .toBuffer();

            return {
                id: item.id || Math.random().toString(36).substring(7),
                pngBase64: pngBuffer.toString('base64'),
                width_px: Math.round(w_mm * (300 / 25.4)),
                height_px: Math.round(tape_width * (300 / 25.4))
            };
        }));

        return NextResponse.json({ items: results });
    } catch (error: any) {
        console.error('Brother label generation error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
