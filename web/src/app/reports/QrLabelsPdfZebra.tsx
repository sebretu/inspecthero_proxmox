import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

Font.register({
    family: 'Roboto',
    fonts: [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 'normal' },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 'bold' },
    ],
});

// Zebra ZM400 — 39x52 mm (Hochformat)
// 1mm = 2.8346pt
const MM = 2.8346;
const LABEL_W = 39 * MM;
const LABEL_H = 52 * MM;
const MARGIN = 2 * MM;
const QR_SIZE = 32 * MM;   // size of the QR code image

const styles = StyleSheet.create({
    page: {
        width: LABEL_W,
        height: LABEL_H,
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        padding: 0,
        overflow: 'hidden',
    },

    // Top: accent
    accent: {
        width: '100%',
        height: 2 * MM,
        flexShrink: 0,
    },

    // QR block
    qrBlock: {
        width: '100%',
        height: 34 * MM,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 1 * MM,
    },
    qrImg: {
        width: QR_SIZE,
        height: QR_SIZE,
    },

    // Text block
    textBlock: {
        flex: 1,
        width: '100%',
        paddingLeft: MARGIN,
        paddingRight: MARGIN,
        paddingTop: 1 * MM,
        paddingBottom: 2 * MM,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 2,
        overflow: 'hidden',
    },
    typeBadge: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#6b7280',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        fontFamily: 'Roboto',
        maxLines: 1,
        textOverflow: 'ellipsis',
        textAlign: 'center',
    },
    name: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#111827',
        fontFamily: 'Roboto',
        maxLines: 3,
        textOverflow: 'ellipsis',
        textAlign: 'center',
    },
    info: {
        fontSize: 8,
        color: '#374151',
        fontFamily: 'Roboto',
        maxLines: 2,
        textOverflow: 'ellipsis',
        textAlign: 'center',
    },
});

type QrItem = {
    id: string;
    type: 'cable' | 'trommel';
    index_number?: number | string;
    name: string;
    info?: string;
    qrBase64: string;
};

interface Props {
    items: QrItem[];
    projectName: string;
}

export default function QrLabelsPdfZebra({ items, projectName }: Props) {
    return (
        <Document>
            {items.map((item) => {
                const isCable = item.type === 'cable';
                const accentColor = isCable ? '#3b82f6' : '#f59e0b';
                const typeLabel = isCable ? 'KABEL' : 'TROMMEL';

                return (
                    <Page
                        key={item.id}
                        size={{ width: LABEL_W, height: LABEL_H }}
                        style={styles.page}
                        wrap={false}
                    >
                        {/* Accent stripe on left edge - only for non-cables (trommels) */}
                        {!isCable && <View style={[styles.accent, { backgroundColor: accentColor }]} />}


                        {/* QR Code block */}
                        <View style={styles.qrBlock}>
                            <Image src={item.qrBase64} style={styles.qrImg} />
                        </View>

                        {/* Text info */}
                        <View style={styles.textBlock}>
                            <Text style={[styles.typeBadge, { color: accentColor }]}>{typeLabel}</Text>
                            <Text style={styles.name}>{item.index_number ? `#${item.index_number} ` : ""}{item.name}</Text>
                            {item.info && <Text style={styles.info}>{item.info}</Text>}
                        </View>
                    </Page>
                );
            })}
        </Document>
    );
}
