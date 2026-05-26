import React from 'react';
import { Page, Document, Image, StyleSheet } from '@react-pdf/renderer';

const MM = 2.8346;

const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        padding: 0,
        margin: 0,
    },
    img: {
        width: '100%',
        height: '100%',
    }
});

interface LabelItem {
    id: string;
    pngBase64: string;
    width_px: number;
    height_px: number;
}

interface Props {
    items: LabelItem[];
}

export default function BrotherPdfDocument({ items }: Props) {
    return (
        <Document>
            {items.map((item, idx) => {
                // Convert px to mm at uniform 300 dpi, then mm to pt for react-pdf
                const w_mm = item.width_px / (300 / 25.4);
                const h_mm = item.height_px / (300 / 25.4);
                
                return (
                    <Page
                        key={item.id || idx}
                        size={{ width: w_mm * MM, height: h_mm * MM }}
                        style={styles.page}
                        wrap={false}
                    >
                        <Image 
                            src={`data:image/png;base64,${item.pngBase64}`} 
                            style={styles.img} 
                        />
                    </Page>
                );
            })}
        </Document>
    );
}
