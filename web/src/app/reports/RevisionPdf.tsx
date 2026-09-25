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
    revisionCard: {
        marginBottom: 20,
        padding: 10,
        backgroundColor: '#fbfbfb',
        border: '1px solid #eee',
        borderRadius: 4
    },
    revisionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
        color: '#1f4f82'
    },
    revisionDesc: {
        fontSize: 10,
        marginBottom: 8,
        color: '#555'
    },
    photoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5
    },
    photo: {
        width: 170,
        height: 130,
        objectFit: 'contain',
        backgroundColor: '#f8fafc',
        borderRadius: 2
    }
});

const formatDate = (date: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
};

export default function RevisionPdf({ projectName, revisions, plansMap, buildingsMap, floorsMap, translations }: any) {
    const t = (key: string) => translations[key] || key;

    // Get unique plan IDs from revisions
    const planIds = Array.from(new Set(revisions.map((r: any) => r.plan_id).filter(Boolean))) as string[];

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

                const planRevisions = revisions.filter((r: any) => r.plan_id === planId);

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
                        <Text style={[styles.subHeader, { marginBottom: 10 }]}>Plan: {planTitle} ({planRevisions.length})</Text>
                        <View style={{ position: 'relative', width: containerWidth, height: containerHeight, alignSelf: 'center' }}>
                            {plan.imageBase64 && (
                                <Image src={plan.imageBase64} style={{ width: renderW, height: renderH, position: 'absolute', left: offsetX, top: offsetY }} />
                            )}
                            {planRevisions.map((rev: any, idx: number) => {
                                if (rev.x_norm === null || rev.y_norm === null) return null;
                                const mX = Math.round(offsetX + (rev.x_norm * renderW) - 6);
                                const mY = Math.round(offsetY + (rev.y_norm * renderH) - 10);
                                return (
                                    <View key={rev.id} style={[styles.marker, { left: mX, top: mY }]}>
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

            {/* Revisions Details */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.subHeader}>{t("title")}</Text>
                {revisions.map((rev: any, idx: number) => (
                    <View key={rev.id} style={styles.revisionCard} wrap={false}>
                        <Text style={styles.revisionTitle}>{idx + 1}. {rev.title}</Text>
                        <Text style={{ fontSize: 8, color: '#999', marginBottom: 4 }}>{formatDate(rev.created_at)}</Text>
                        {rev.description && <Text style={styles.revisionDesc}>{rev.description}</Text>}
                        <View style={styles.photoGrid}>
                            {rev.revision_photos?.map((p: any) => (
                                p.b64 && <Image key={p.id} src={p.b64} style={styles.photo} />
                            ))}
                        </View>
                    </View>
                ))}
            </Page>
        </Document>
    );
}
