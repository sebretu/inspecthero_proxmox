import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font, Svg, Path } from '@react-pdf/renderer';

Font.register({
    family: 'Roboto',
    fonts: [
        {
            src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
            fontWeight: 'normal',
        },
        {
            src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
            fontWeight: 'bold',
        },
    ],
});

const ROBOTO = 'Roboto';

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: ROBOTO,
        fontSize: 10,
        color: '#333',
    },
    planPage: {
        padding: 10,
        fontFamily: ROBOTO,
        fontSize: 10,
        color: '#333',
        flexDirection: 'column',
    },
    header: {
        fontSize: 24,
        marginBottom: 20,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    subHeader: {
        fontSize: 14,
        marginBottom: 8,
        borderBottomWidth: 1,
        color: '#1f4f82',
        fontWeight: 'bold'
    },
    marker: {
        position: 'absolute',
        width: 12,
        alignItems: 'center',
        justifyContent: 'flex-end',
        display: 'flex',
        flexDirection: 'column',
    },
    markerText: {
        color: '#1f4f82',
        fontSize: 4,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 0,
        backgroundColor: 'rgba(255,255,255,0.7)',
        padding: 0.5,
        borderRadius: 1
    },
    fehlerCard: {
        marginBottom: 20,
        padding: 10,
        backgroundColor: '#fbfbfb',
        border: '1px solid #eee',
        borderRadius: 4
    },
    fehlerTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
        color: '#1f4f82'
    },
    fehlerDesc: {
        fontSize: 10,
        marginBottom: 8,
        color: '#555'
    },
    infoRow: {
        flexDirection: 'row',
        marginBottom: 8,
        gap: 20
    },
    infoItem: {
        flexDirection: 'column'
    },
    infoLabel: {
        fontSize: 8,
        color: '#999',
        marginBottom: 2
    },
    infoValue: {
        fontSize: 10,
        fontWeight: 'bold'
    },
    photoComparison: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 5
    },
    photoWrapper: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2
    },
    photo: {
        width: 250,
        height: 190,
        objectFit: 'contain',
        backgroundColor: '#f8fafc',
        borderRadius: 2
    },
    photoLabel: {
        fontSize: 8,
        color: '#666'
    }
});

const formatDate = (date: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
};

export default function FehlerPdf({ projectName, fehlerItems, plansMap, buildingsMap, floorsMap, translations }: any) {
    const t = (key: string) => translations[key] || key;

    const planIds = Array.from(new Set(fehlerItems.map((r: any) => r.plan_id).filter(Boolean))) as string[];

    return (
        <Document>
            {/* Title Page */}
            <Page size="A4" orientation="landscape" style={styles.page}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={styles.header}>{t("title")}</Text>
                    <Text style={{ fontSize: 16, marginBottom: 10 }}>{t("project")}: {projectName}</Text>
                    <Text style={{ marginBottom: 5 }}>{t("generatedOn")}: {new Date().toLocaleString()}</Text>
                </View>
            </Page>

            {/* Plan Pages */}
            {planIds.map((planId: string) => {
                const plan = plansMap[planId];
                if (!plan) return null;

                const floor = floorsMap[plan.floor_id];
                const building = buildingsMap[floor?.building_id];
                const planTitle = `${building?.name || "?"} - ${floor?.name || "?"} (v${plan.version})`;

                const planFehler = fehlerItems.filter((f: any) => f.plan_id === planId);

                const pageWidth = 842;
                const pageHeight = 595;
                const padding = 10;
                const containerWidth = pageWidth - (padding * 2);
                const containerHeight = pageHeight - (padding * 2) - 30;

                const imgW = plan.image_width || 1000;
                const imgH = plan.image_height || 700;
                const imgRatio = imgW / imgH;
                const containerRatio = containerWidth / containerHeight;

                let renderW, renderH, offsetX, offsetY;
                if (imgRatio > containerRatio) {
                    renderW = containerWidth;
                    renderH = containerWidth / imgRatio;
                    offsetX = 0;
                    offsetY = (containerHeight - renderH) / 2;
                } else {
                    renderH = containerHeight;
                    renderW = containerHeight * imgRatio;
                    offsetX = (containerWidth - renderW) / 2;
                    offsetY = 0;
                }

                return (
                    <Page key={planId} size="A4" orientation="landscape" style={styles.planPage}>
                        <Text style={[styles.subHeader, { marginBottom: 10 }]}>Plan: {planTitle} ({planFehler.length})</Text>
                        <View style={{ position: 'relative', width: containerWidth, height: containerHeight, alignSelf: 'center' }}>
                            {plan.imageBase64 && (
                                <Image src={plan.imageBase64} style={{ width: renderW, height: renderH, position: 'absolute', left: offsetX, top: offsetY }} />
                            )}
                            {planFehler.map((f: any, idx: number) => {
                                if (f.x_norm === null || f.y_norm === null) return null;
                                const mX = Math.round(offsetX + (f.x_norm * renderW) - 6);
                                const mY = Math.round(offsetY + (f.y_norm * renderH) - 10);
                                return (
                                    <View key={f.id} style={[styles.marker, { left: mX, top: mY }]}>
                                        <Text style={styles.markerText}>{idx + 1}</Text>
                                        <Svg width={8} height={4} viewBox="0 0 10 5">
                                            <Path d="M0 0 L5 5 L10 0 Z" fill="#1f4f82" />
                                        </Svg>
                                    </View>
                                );
                            })}
                        </View>
                    </Page>
                );
            })}

            {/* Fehler Details */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.subHeader}>{t("title")}</Text>
                {fehlerItems.map((f: any, idx: number) => (
                    <View key={f.id} style={styles.fehlerCard} wrap={false}>
                        <Text style={styles.fehlerTitle}>{idx + 1}. {f.title}</Text>
                        <View style={styles.infoRow}>
                            <View style={styles.infoItem}>
                                <Text style={styles.infoLabel}>{t("priority")}</Text>
                                <Text style={[styles.infoValue, { color: f.priority === 'HIGH' ? '#ef4444' : '#333' }]}>{f.priority}</Text>
                            </View>
                            <View style={styles.infoItem}>
                                <Text style={styles.infoLabel}>{t("assignee")}</Text>
                                <Text style={styles.infoValue}>{f.profiles?.full_name || "-"}</Text>
                            </View>
                            <View style={styles.infoItem}>
                                <Text style={styles.infoLabel}>{t("generatedOn")}</Text>
                                <Text style={styles.infoValue}>{formatDate(f.created_at)}</Text>
                            </View>
                        </View>
                        {f.description && <Text style={styles.fehlerDesc}>{f.description}</Text>}

                        <View style={styles.photoComparison}>
                            {f.beforePhoto && (
                                <View style={styles.photoWrapper}>
                                    <Image src={f.beforePhoto} style={styles.photo} />
                                    <Text style={styles.photoLabel}>{t("before")}</Text>
                                </View>
                            )}
                            {f.afterPhoto && (
                                <View style={styles.photoWrapper}>
                                    <Image src={f.afterPhoto} style={styles.photo} />
                                    <Text style={styles.photoLabel}>{t("after")}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                ))}
            </Page>
        </Document>
    );
}
