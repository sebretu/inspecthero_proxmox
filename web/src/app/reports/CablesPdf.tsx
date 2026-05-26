import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font, Svg, Path, G, Circle } from '@react-pdf/renderer';

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
    section: {
        margin: 10,
        padding: 10,
        flexGrow: 1,
    },
    subHeader: {
        fontSize: 14,
        marginBottom: 8,
        borderBottomWidth: 1,
        color: '#1f4f82',
        fontWeight: 'bold'
    },
    table: {
        display: 'flex',
        width: '100%',
        borderStyle: 'solid',
        borderColor: '#bfbfbf',
        borderWidth: 1,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        marginTop: 10
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomColor: '#bfbfbf',
        borderBottomWidth: 1,
        alignItems: 'center',
        minHeight: 24
    },
    tableColHeader: {
        backgroundColor: '#f0f0f0',
        padding: 5,
        borderRightColor: '#bfbfbf',
        borderRightWidth: 1,
    },
    tableCol: {
        padding: 5,
        borderRightColor: '#bfbfbf',
        borderRightWidth: 1,
    },
    tableCellHeader: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#333'
    },
    tableCell: {
        fontSize: 9,
        color: '#333'
    },
    qrImage: {
        width: 40,
        height: 40,
    },
    planContainer: {
        position: 'relative',
        width: '100%',
        height: 500,
        backgroundColor: '#f9f9f9',
        border: '1px solid #eee',
        marginBottom: 20,
        overflow: 'hidden'
    },
    planImage: {
        width: '100%',
        height: '100%',
        objectFit: 'contain'
    }
});

export default function CablesPdf({ projectName, cables, trommels, plansMap, buildingsMap, floorsMap, translations }: any) {
    // translations is a flat object with keys from the cables_pdf namespace
    const t = (key: string, fallback?: string) => translations[key] || fallback || key;

    const getStatusLabel = (status: string) => {
        return t(`status_${status}`, status);
    };

    // Group cables by plan
    const cablesByPlan: Record<string, any[]> = {};
    cables.forEach((c: any) => {
        const planId = c.cable_routes?.plan_id;
        const planId2 = c.cable_routes?.plan_id_2;
        if (planId) {
            if (!cablesByPlan[planId]) cablesByPlan[planId] = [];
            cablesByPlan[planId].push(c);
        }
        if (planId2) {
            if (!cablesByPlan[planId2]) cablesByPlan[planId2] = [];
            cablesByPlan[planId2].push(c);
        }
    });

    return (
        <Document>
            {/* Title Page */}
            <Page size="A4" style={styles.page}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={styles.header}>{t('title')}</Text>
                    <Text style={{ fontSize: 16, marginBottom: 10 }}>{t('project')}: {projectName}</Text>
                    <Text style={{ marginBottom: 5 }}>{t('generatedOn')}: {new Date().toLocaleString()}</Text>
                </View>

                {/* Summary */}
                <View style={styles.section}>
                    <Text style={styles.subHeader}>{t('summary')}</Text>
                    <Text>{t('totalCables')}: {cables.length}</Text>
                    <Text>{t('totalTrommels')}: {trommels.length}</Text>
                </View>
            </Page>

            {/* Plan Pages with Routes */}
            {Object.entries(cablesByPlan).map(([planId, planCables]) => {
                const plan = plansMap[planId];
                if (!plan) return null;

                const floor = floorsMap[plan.floor_id];
                const building = buildingsMap[floor?.building_id];
                const planTitle = `${building?.name || "?"} - ${floor?.name || "?"}`;

                const pageWidth = 842; // A4 Landscape
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
                    <>
                        {/* ── PAGE 1: MAP ── */}
                        <Page key={`map-${planId}`} size="A4" orientation="landscape" style={styles.planPage}>
                            <Text style={[styles.subHeader, { marginBottom: 6 }]}>{t('plan')}: {planTitle} - {t('cableRoutes')}</Text>
                            <View style={{ position: 'relative', width: containerWidth, height: containerHeight, alignSelf: 'center' }}>
                                {plan.imageBase64 && (() => {
                                    const COLORS = ['#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#6366f1','#84cc16','#0ea5e9','#e11d48'];
                                    return (
                                        <>
                                            <Image src={plan.imageBase64} style={{ width: renderW, height: renderH, position: 'absolute', left: offsetX, top: offsetY }} />
                                            <Svg width={containerWidth} height={containerHeight} style={{ position: 'absolute', left: 0, top: 0 }}>
                                                {planCables.map((c, idx) => {
                                                    const r = c.cable_routes;
                                                    if (!r) return null;
                                                    const color = COLORS[idx % COLORS.length];
                                                    const toX = (nx: number) => offsetX + nx * renderW;
                                                    const toY = (ny: number) => offsetY + ny * renderH;

                                                    const isPlan1 = r.plan_id === planId;
                                                    const isPlan2 = r.plan_id_2 === planId;

                                                    if (isPlan1 && r.point_a_x != null && r.point_b_x != null) {
                                                        const ax = toX(r.point_a_x), ay = toY(r.point_a_y);
                                                        const bx = toX(r.point_b_x), by = toY(r.point_b_y);
                                                        const wps: {x:number;y:number}[] = Array.isArray(r.waypoints) ? r.waypoints : [];
                                                        let d = `M ${ax} ${ay}`;
                                                        for (const wp of wps) d += ` L ${toX(wp.x)} ${toY(wp.y)}`;
                                                        d += ` L ${bx} ${by}`;
                                                        return (
                                                            <G key={`p1-${c.id}`}>
                                                                <Path d={d} stroke="white" strokeWidth={0.4} fill="none" opacity={0.45} />
                                                                <Path d={d} stroke={color} strokeWidth={0.25} fill="none" opacity={1} />
                                                                <Circle cx={ax} cy={ay} r={0.5} fill="white" opacity={1} />
                                                                <Circle cx={ax} cy={ay} r={0.4} fill={color} opacity={1} />
                                                                <Circle cx={bx} cy={by} r={0.5} fill="white" stroke={color} strokeWidth={0.2} opacity={1} />
                                                            </G>
                                                        );
                                                    }

                                                    if (isPlan2 && r.point_c_x != null && r.point_d_x != null) {
                                                        const cx = toX(r.point_c_x), cy = toY(r.point_c_y);
                                                        const dx = toX(r.point_d_x), dy = toY(r.point_d_y);
                                                        const wps2: {x:number;y:number}[] = Array.isArray(r.waypoints_2) ? r.waypoints_2 : [];
                                                        let d = `M ${cx} ${cy}`;
                                                        for (const wp of wps2) d += ` L ${toX(wp.x)} ${toY(wp.y)}`;
                                                        d += ` L ${dx} ${dy}`;
                                                        return (
                                                            <G key={`p2-${c.id}`}>
                                                                <Path d={d} stroke="white" strokeWidth={0.4} fill="none" opacity={0.45} />
                                                                <Path d={d} stroke={color} strokeWidth={0.25} fill="none" opacity={1} />
                                                                <Circle cx={cx} cy={cy} r={0.5} fill="white" opacity={1} />
                                                                <Circle cx={cx} cy={cy} r={0.4} fill={color} opacity={1} />
                                                                <Circle cx={dx} cy={dy} r={0.5} fill="white" stroke={color} strokeWidth={0.2} opacity={1} />
                                                            </G>
                                                        );
                                                    }
                                                    return null;
                                                })}
                                            </Svg>
                                        </>
                                    );
                                })()}
                            </View>
                        </Page>

                        {/* ── PAGE 2: LEGEND ── */}
                        <Page key={`legend-${planId}`} size="A4" style={styles.page}>
                            <Text style={[styles.subHeader, { marginBottom: 10 }]}>{t('plan')}: {planTitle} — {t('cableList')}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {planCables.map((c, idx) => {
                                    const COLORS = ['#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#6366f1','#84cc16','#0ea5e9','#e11d48'];
                                    const color = COLORS[idx % COLORS.length];
                                    const r = c.cable_routes;
                                    const route = r ? `${r.point_a_label} → ${r.point_b_label}` : '';
                                    return (
                                        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'flex-start', width: '31%', marginBottom: 8, gap: 6, padding: 6, borderWidth: 0.5, borderColor: '#e5e7eb', borderRadius: 4 }}>
                                            {/* Swatch ●──○ */}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 1, marginTop: 2 }}>
                                                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
                                                <View style={{ width: 14, height: 2, backgroundColor: color }} />
                                                <View style={{ width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.5, borderColor: color, backgroundColor: 'white' }} />
                                            </View>
                                            {/* Text */}
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#111827' }}>{c.index_number ? `#${c.index_number} ` : ""}{c.name}</Text>
                                                {c.cable_type && <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 1 }}>{c.cable_type}</Text>}
                                                {c.length != null && <Text style={{ fontSize: 7.5, color: '#374151', marginTop: 1 }}>{c.length} m</Text>}
                                                {route && <Text style={{ fontSize: 7.5, color: '#374151', marginTop: 2 }}>{route}</Text>}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </Page>
                    </>
                );


            })}

            {/* Cable List */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.subHeader}>{t('cableList')}</Text>
                <View style={styles.table}>
                    <View style={styles.tableRow}>
                        <View style={[styles.tableColHeader, { width: '30%' }]}><Text style={styles.tableCellHeader}>{t('nameType')}</Text></View>
                        <View style={[styles.tableColHeader, { width: '15%' }]}><Text style={styles.tableCellHeader}>{t('status')}</Text></View>
                        <View style={[styles.tableColHeader, { width: '20%' }]}><Text style={styles.tableCellHeader}>{t('trommelLen')}</Text></View>
                        <View style={[styles.tableColHeader, { width: '20%' }]}><Text style={styles.tableCellHeader}>{t('route')}</Text></View>
                        <View style={[styles.tableColHeader, { width: '15%' }]}><Text style={styles.tableCellHeader}>{t('qrCode')}</Text></View>
                    </View>
                    {cables.map((c: any) => {
                        const finalType = c.cable_type || c.trommels?.cable_type || '-';
                        return (
                            <View key={c.id} style={styles.tableRow} wrap={false}>
                                <View style={[styles.tableCol, { width: '30%' }]}>
                                    <Text style={[styles.tableCell, { fontWeight: 'bold', fontSize: 10 }]}>{c.index_number ? `#${c.index_number} ` : ""}{c.name}</Text>
                                    <Text style={[styles.tableCell, { fontSize: 8, color: '#06b6d4', fontWeight: 'bold', marginTop: 2 }]}>
                                        {t('type')}: {finalType}
                                    </Text>
                                </View>
                                <View style={[styles.tableCol, { width: '15%' }]}>
                                    <Text style={styles.tableCell}>{getStatusLabel(c.status)}</Text>
                                </View>
                                <View style={[styles.tableCol, { width: '20%' }]}>
                                    <Text style={styles.tableCell}>{c.trommels?.name || '-'}</Text>
                                    <Text style={[styles.tableCell, { fontSize: 7, color: '#666' }]}>{c.length ? `${c.length}m` : '-'}</Text>
                                </View>
                                <View style={[styles.tableCol, { width: '20%' }]}>
                                    <Text style={styles.tableCell}>{c.cable_routes ? `${c.cable_routes.point_a_label} → ${c.cable_routes.point_b_label}` : '-'}</Text>
                                </View>
                                <View style={[styles.tableCol, { width: '15%', alignItems: 'center', justifyContent: 'center' }]}>
                                    {c.qrBase64 && <Image src={c.qrBase64} style={styles.qrImage} />}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </Page>

            {/* Trommel List */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.subHeader}>{t('trommelList')}</Text>
                <View style={styles.table}>
                    <View style={styles.tableRow}>
                        <View style={[styles.tableColHeader, { width: '35%' }]}><Text style={styles.tableCellHeader}>{t('name')}</Text></View>
                        <View style={[styles.tableColHeader, { width: '20%' }]}><Text style={styles.tableCellHeader}>{t('cableType')}</Text></View>
                        <View style={[styles.tableColHeader, { width: '30%' }]}><Text style={styles.tableCellHeader}>{t('lengthTotal')}</Text></View>
                        <View style={[styles.tableColHeader, { width: '15%' }]}><Text style={styles.tableCellHeader}>{t('qrCode')}</Text></View>
                    </View>
                    {trommels.map((tr: any) => {
                        const trTypeFallback = tr.cable_type || tr.cables?.find((c: any) => c.cable_type)?.cable_type || '-';
                        return (
                            <View key={tr.id} style={styles.tableRow} wrap={false}>
                                <View style={[styles.tableCol, { width: '35%' }]}>
                                    <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{tr.index_number ? `#${tr.index_number} ` : ""}{tr.name}</Text>
                                </View>
                                <View style={[styles.tableCol, { width: '20%' }]}>
                                    <Text style={styles.tableCell}>{trTypeFallback}</Text>
                                </View>
                                <View style={[styles.tableCol, { width: '30%' }]}>
                                    <Text style={styles.tableCell}>{tr.total_length ? `${tr.total_length}m` : '-'}</Text>
                                    <Text style={[styles.tableCell, { fontSize: 7, color: '#666' }]}>{t('usedLabel')}: {tr.used_length || 0}m</Text>
                                </View>
                                <View style={[styles.tableCol, { width: '15%', alignItems: 'center', justifyContent: 'center' }]}>
                                    {tr.qrBase64 && <Image src={tr.qrBase64} style={styles.qrImage} />}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </Page>
        </Document>
    );
}

