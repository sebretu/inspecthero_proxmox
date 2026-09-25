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
        color: '#4f46e5',
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
        color: '#ffffff',
        fontSize: 5,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 0,
        backgroundColor: '#4f46e5',
        padding: 1,
        borderRadius: 1
    },
    questionCard: {
        marginBottom: 20,
        padding: 10,
        backgroundColor: '#fbfbfb',
        border: '1px solid #eee',
        borderRadius: 4
    },
    questionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4,
        color: '#4f46e5'
    },
    questionDesc: {
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

export default function FragenPdf({ projectName, questions, plansMap, buildingsMap, floorsMap, translations }: any) {
    const t = (key: string) => translations[key] || key;

    // Get unique plan IDs from questions
    const planIds = Array.from(new Set(questions.map((q: any) => q.plan_id).filter(Boolean))) as string[];

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

                const planQuestions = questions.filter((q: any) => q.plan_id === planId);

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
                        <Text style={[styles.subHeader, { marginBottom: 10 }]}>Plan: {planTitle} ({planQuestions.length})</Text>
                        <View style={{ position: 'relative', width: containerWidth, height: containerHeight, alignSelf: 'center' }}>
                            {plan.imageBase64 && (
                                <Image src={plan.imageBase64} style={{ width: renderW, height: renderH, position: 'absolute', left: offsetX, top: offsetY }} />
                            )}
                            {planQuestions.map((q: any, idx: number) => {
                                if (q.x_norm === null || q.y_norm === null) return null;
                                const mX = Math.round(offsetX + (q.x_norm * renderW) - 6);
                                const mY = Math.round(offsetY + (q.y_norm * renderH) - 10);
                                return (
                                    <View key={q.id} style={[styles.marker, { left: mX, top: mY }]}>
                                        <Text style={styles.markerText}>{idx + 1}</Text>
                                        <Svg width={8} height={4} viewBox="0 0 10 5">
                                            <Path d="M0 0 L5 5 L10 0 Z" fill="#4f46e5" />
                                        </Svg>
                                    </View>
                                );
                            })}
                        </View>
                    </Page>
                );
            })}

            {/* Questions Details */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.subHeader}>{t("title")}</Text>
                {questions.map((q: any, idx: number) => (
                    <View key={q.id} style={styles.questionCard} wrap={false}>
                        <Text style={styles.questionTitle}>{idx + 1}. {q.title}</Text>
                        <View style={styles.infoRow}>
                            <View style={styles.infoItem}>
                                <Text style={styles.infoLabel}>{t("priority")}</Text>
                                <Text style={[styles.infoValue, { color: q.priority === 'CRITICAL' || q.priority === 'HIGH' ? '#ef4444' : '#333' }]}>{q.priority}</Text>
                            </View>
                            <View style={styles.infoItem}>
                                <Text style={styles.infoLabel}>{t("assignee")}</Text>
                                <Text style={styles.infoValue}>{q.assigneeName || "-"}</Text>
                            </View>
                            <View style={styles.infoItem}>
                                <Text style={styles.infoLabel}>{t("generatedOn")}</Text>
                                <Text style={styles.infoValue}>{formatDate(q.created_at)}</Text>
                            </View>
                        </View>
                        {q.description && <Text style={styles.questionDesc}>{q.description}</Text>}
                        <View style={styles.photoGrid}>
                            {q.task_photos?.map((p: any) => (
                                p.b64 && <Image key={p.id} src={p.b64} style={styles.photo} />
                            ))}
                        </View>
                    </View>
                ))}
            </Page>
        </Document>
    );
}
