import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

Font.register({
    family: 'Roboto',
    fonts: [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 'normal' },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 'bold' },
    ],
});

const MM = 2.8346;

const createStyles = (labelW: number, labelH: number) => StyleSheet.create({
    page: {
        width: labelW * MM,
        height: labelH * MM,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        padding: 0,
    },
    qrBlock: {
        width: labelH * MM,
        height: labelH * MM,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    qrImg: {
        width: (labelH - 3) * MM,
        height: (labelH - 3) * MM,
    },
    textBlock: {
        flex: 1,
        paddingLeft: 1.5 * MM,
        paddingRight: 1.5 * MM,
        paddingTop: 0.5 * MM,
        paddingBottom: 0.5 * MM,
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    name: {
        fontSize: labelH > 20 ? 9.5 : 8.5,
        fontWeight: 'bold',
        color: '#111827',
        fontFamily: 'Roboto',
        lineHeight: 1.1,
    },
    indexNumber: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#374151',
        fontFamily: 'Roboto',
    },
    accent: {
        width: 2.5,
        height: labelH * MM,
        flexShrink: 0,
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
    labelW?: number;
    labelH?: number;
}

export default function QrLabelsPdf({ items, projectName, labelW = 40, labelH = 18 }: Props) {
    const styles = createStyles(labelW, labelH);

    return (
        <Document>
            {items.map((item) => {
                const isCable = item.type === 'cable';
                const accentColor = isCable ? '#3b82f6' : '#f59e0b';

                return (
                    <Page
                        key={item.id}
                        size={{ width: labelW * MM, height: labelH * MM }}
                        style={styles.page}
                        wrap={false}
                    >
                        {!isCable && <View style={[styles.accent, { backgroundColor: accentColor }]} wrap={false} />}

                        <View style={styles.qrBlock} wrap={false}>
                            <Image src={item.qrBase64} style={styles.qrImg} />
                        </View>
                        <View style={styles.textBlock} wrap={false}>
                            <Text style={[styles.indexNumber, { marginBottom: 1 }]}>
                                {item.index_number ? `#${item.index_number}` : ""}
                            </Text>
                            <Text 
                                style={[styles.name, { lineHeight: 1, marginBottom: 1, maxLines: 2 }]} 
                            >
                                {item.name || "???"}
                            </Text>
                            <Text style={[styles.indexNumber, { fontWeight: 'normal', color: '#374151', maxLines: 1 }]}>
                                {item.info || ""}
                            </Text>
                        </View>
                    </Page>
                );
            })}
        </Document>
    );
}
