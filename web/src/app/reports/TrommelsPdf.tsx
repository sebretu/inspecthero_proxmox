import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

Font.register({
    family: 'Roboto',
    fonts: [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 'normal' },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 'bold' },
    ],
});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Roboto', fontSize: 10, color: '#333' },
    header: { fontSize: 22, marginBottom: 6, textAlign: 'center', fontWeight: 'bold', color: '#1f4f82' },
    subHeader: { fontSize: 10, textAlign: 'center', color: '#888', marginBottom: 20 },
    cardGrid: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    card: {
        width: '46%',
        border: '1px solid #dde',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        backgroundColor: '#fafbff',
        display: 'flex',
        flexDirection: 'row',
        gap: 10,
    },
    photoCol: { width: 64, flexShrink: 0 },
    photo: { width: 64, height: 64, borderRadius: 6, objectFit: 'contain', backgroundColor: '#f8fafc', border: '1px solid #ccc' },
    photoPlaceholder: { width: 64, height: 64, borderRadius: 6, backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    infoCol: { flex: 1 },
    trommelName: { fontSize: 12, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 4 },
    badge: { fontSize: 8, fontWeight: 'bold', color: '#1d4ed8', backgroundColor: '#dbeafe', padding: '2px 6px', borderRadius: 4, alignSelf: 'flex-start', marginBottom: 3 },
    company: { fontSize: 9, color: '#444', marginBottom: 2 },
    serial: { fontSize: 9, color: '#1d4ed8', fontWeight: 'bold', marginBottom: 4 },
    divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 6 },
    cableRow: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    cableName: { fontSize: 8, color: '#333' },
    cableLen: { fontSize: 8, color: '#888' },
    gauge: { height: 5, backgroundColor: '#e5e7eb', borderRadius: 3, marginTop: 5, overflow: 'hidden' },
    gaugeBar: { height: '100%', borderRadius: 3 },
    capacity: { fontSize: 8, color: '#666', marginTop: 3 },
    qr: { width: 48, height: 48, alignSelf: 'flex-end', marginTop: 'auto' },
    qrCol: { flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' },
    pageNum: { position: 'absolute', bottom: 18, right: 30, fontSize: 8, color: '#aaa' },
});

export default function TrommelsPdf({ projectName, trommels, translations, includePhotos, includeCompanyInfo }: any) {
    const t = (key: string, fallback?: string) => translations?.[key] || fallback || key;

    return (
        <Document>
            <Page size="A4" style={styles.page} wrap>
                {/* Title */}
                <Text style={styles.header}>{t('trommelReportTitle', 'Raport Bębnów Kablowych')}</Text>
                <Text style={styles.subHeader}>
                    {t('project', 'Projekt')}: {projectName} · {t('generatedOn', 'Wygenerowano')}: {new Date().toLocaleString()}
                </Text>
                <Text style={styles.subHeader}>
                    {t('totalTrommels', 'Łączna liczba bębnów')}: {trommels.length}
                </Text>

                {/* Trommel Cards */}
                <View style={styles.cardGrid}>
                    {trommels.map((tr: any) => {
                        const cables: any[] = tr.cables || [];
                        const usedLen = tr.used_length ?? cables.reduce((s: number, c: any) => s + (c.length || 0), 0);
                        const totalLen = tr.total_length;
                        const usedPct = totalLen ? Math.min(100, (usedLen / totalLen) * 100) : 0;
                        const gaugeColor = usedPct >= 100 ? '#ef4444' : usedPct >= 80 ? '#f97316' : '#22c55e';

                        return (
                            <View key={tr.id} style={styles.card} wrap={false}>
                                {/* Photo */}
                                {includePhotos && (
                                    <View style={styles.photoCol}>
                                        {tr.photoBase64
                                            ? <Image src={tr.photoBase64} style={styles.photo} />
                                            : <View style={styles.photoPlaceholder}><Text style={{ fontSize: 7, color: '#aaa' }}>—</Text></View>
                                        }
                                    </View>
                                )}

                                {/* Info */}
                                <View style={styles.infoCol}>
                                    <Text style={styles.trommelName}>{tr.index_number ? `#${tr.index_number} ` : ""}{tr.name}</Text>

                                    {includeCompanyInfo && tr.company_name && (
                                        <Text style={styles.company}>🏭 {tr.company_name}</Text>
                                    )}
                                    {includeCompanyInfo && tr.serial_number && (
                                        <Text style={styles.serial}>Nr: {tr.serial_number}</Text>
                                    )}

                                    {totalLen != null && (
                                        <>
                                            <View style={styles.gauge}>
                                                <View style={[styles.gaugeBar, { width: `${usedPct}%`, backgroundColor: gaugeColor }]} />
                                            </View>
                                            <Text style={styles.capacity}>
                                                {usedLen}m / {totalLen}m ({t('usedLabel', 'zużyto')}: {Math.round(usedPct)}%)
                                            </Text>
                                        </>
                                    )}

                                    {cables.length > 0 && (
                                        <>
                                            <View style={styles.divider} />
                                            {cables.slice(0, 6).map((c: any) => (
                                                <View key={c.id} style={styles.cableRow}>
                                                    <Text style={styles.cableName}>▸ {c.name}{c.cable_type ? ` (${c.cable_type})` : ''}</Text>
                                                    <Text style={styles.cableLen}>{c.length != null ? `${c.length}m` : ''}</Text>
                                                </View>
                                            ))}
                                            {cables.length > 6 && (
                                                <Text style={{ fontSize: 7, color: '#aaa' }}>+ {cables.length - 6} więcej...</Text>
                                            )}
                                        </>
                                    )}
                                </View>

                                {/* QR */}
                                {tr.qrBase64 && (
                                    <View style={styles.qrCol}>
                                        <Image src={tr.qrBase64} style={styles.qr} />
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>

                <Text style={{ position: 'absolute', bottom: 18, left: 30, fontSize: 7, color: '#aaa' }} fixed>
                    {t('owner', 'Inhaber: Marcin Slapinski')}
                </Text>
                <Text style={styles.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
            </Page>
        </Document>
    );
}
