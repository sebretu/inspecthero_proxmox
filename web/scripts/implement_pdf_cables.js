const fs = require("fs");
const path = require("path");

console.log("Updating PlanElementsPdf.tsx for Cables, Schemata & Kabelzugliste...");

const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let content = fs.readFileSync(pdfPath, "utf8");

// 1. Update PlanElementsReportOptions
if (!content.includes("includeCables?: boolean;")) {
  content = content.replace(
    "includeHeating?: boolean;",
    `includeHeating?: boolean;
    includeCables?: boolean;
    includeFreeLines?: boolean;
    includeKabelzugliste?: boolean;
    schemaBackground?: 'grundriss' | 'white';`
  );
}

// 2. Update PlanElementsPlanData type
if (!content.includes("cableConnections?: any[];")) {
  content = content.replace(
    "bmaSymbols: any[];",
    "bmaSymbols: any[];\n    cableConnections?: any[];"
  );
}

// 3. Add vector cable rendering inside the SVG overlay in PlanElementsPdf.tsx
const cableVectorCode = `
                                {/* 4.6. Cable Connections & Free Lines Vector Rendering */}
                                {options.includeCables !== false && (plan.cableConnections || []).map((c: any, cIdx: number) => {
                                    const m = c.metadata || {};
                                    const isFree = c.type === 'FREE_LINE' || m.is_free_line;
                                    const strokeColor = c.color || (isFree ? '#f59e0b' : '#0284c7');
                                    let pts: Array<{ x: number; y: number }> = [];

                                    if (isFree) {
                                        const wps = m.waypoints || [];
                                        if (wps.length < 2) return null;
                                        pts = wps.map((p: any) => ({ x: mapX(p.x_norm), y: mapY(p.y_norm) }));
                                    } else {
                                        const s1 = plan.bmaSymbols?.find((s: any) => s.id === m.source_symbol_id);
                                        const s2 = plan.bmaSymbols?.find((s: any) => s.id === m.target_symbol_id);
                                        
                                        const startX = s1 ? mapX(s1.x_norm) : (m.waypoints?.[0] ? mapX(m.waypoints[0].x_norm) : 0);
                                        const startY = s1 ? mapY(s1.y_norm) : (m.waypoints?.[0] ? mapY(m.waypoints[0].y_norm) : 0);
                                        
                                        const endX = s2 ? mapX(s2.x_norm) : (m.waypoints?.length ? mapX(m.waypoints[m.waypoints.length - 1].x_norm) : startX);
                                        const endY = s2 ? mapY(s2.y_norm) : (m.waypoints?.length ? mapY(m.waypoints[m.waypoints.length - 1].y_norm) : startY);

                                        pts.push({ x: startX, y: startY });
                                        if (m.waypoints && Array.isArray(m.waypoints)) {
                                            for (const wp of m.waypoints) {
                                                pts.push({ x: mapX(wp.x_norm), y: mapY(wp.y_norm) });
                                            }
                                        }
                                        pts.push({ x: endX, y: endY });
                                    }

                                    if (pts.length < 2) return null;

                                    // Collision offset: apply slight offset if multiple cables share segment
                                    const offset = (cIdx % 3 - 1) * 3;
                                    const polyPointsStr = pts.map(p => \`\${Math.round(p.x + offset)},\${Math.round(p.y + offset)}\`).join(' ');
                                    
                                    // Midpoint for cable label badge
                                    const midIdx = Math.floor(pts.length / 2);
                                    const midP1 = pts[midIdx - 1] || pts[0];
                                    const midP2 = pts[midIdx] || pts[pts.length - 1];
                                    const badgeX = Math.round((midP1.x + midP2.x) / 2 + offset);
                                    const badgeY = Math.round((midP1.y + midP2.y) / 2 + offset);
                                    
                                    const labelText = [m.cable_number || c.name, m.cable_type].filter(Boolean).join(' - ') + (m.length_meters ? \` (\${m.length_meters}m)\` : '');

                                    return (
                                        <G key={\`cable-pdf-\${c.id || cIdx}\`}>
                                            <Polyline
                                                points={polyPointsStr}
                                                stroke={strokeColor}
                                                strokeWidth={2.5}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                fill="none"
                                            />
                                            {/* Start and end node circles for connected cables */}
                                            {!isFree && pts[0] && (
                                                <Circle cx={pts[0].x} cy={pts[0].y} r={3.5} fill={strokeColor} />
                                            )}
                                            {!isFree && pts[pts.length - 1] && (
                                                <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3.5} fill={strokeColor} />
                                            )}
                                            {/* Cable Badge Text */}
                                            {labelText && (
                                                <G>
                                                    <Rect
                                                        x={badgeX - (labelText.length * 2.8)}
                                                        y={badgeY - 7}
                                                        width={labelText.length * 5.6 + 6}
                                                        height={14}
                                                        fill="#0f172a"
                                                        fillOpacity={0.88}
                                                        stroke={strokeColor}
                                                        strokeWidth={1}
                                                        rx={3}
                                                    />
                                                    <SvgText
                                                        x={badgeX + 3}
                                                        y={badgeY + 3}
                                                        fill="#ffffff"
                                                        textAnchor="middle"
                                                        style={{ fontSize: 7.5, fontWeight: 'bold' }}
                                                    >
                                                        {labelText}
                                                    </SvgText>
                                                </G>
                                            )}
                                        </G>
                                    );
                                })}`;

if (!content.includes("4.6. Cable Connections & Free Lines Vector Rendering")) {
  content = content.replace(
    "{/* 4.5. Custom Device Boxes (Geräte / Steuerung) */}",
    cableVectorCode + "\n\n                                {/* 4.5. Custom Device Boxes (Geräte / Steuerung) */}"
  );
}

// 4. Add Kabelzugliste Table Page generator at the end of Document
const kabelzuglistePageCode = `
            {/* ══════════════════════════════════════════════════════════════════════
                PAGE: KABELZUGLISTE & VERBINDUNGSÜBERSICHT
            ══════════════════════════════════════════════════════════════════════ */}
            {(() => {
                if (options.includeKabelzugliste === false) return null;

                // Collect all cable connections from all plans
                const allConnections: any[] = [];
                for (const p of plansData) {
                    if (p.cableConnections && Array.isArray(p.cableConnections)) {
                        for (const conn of p.cableConnections) {
                            if (!allConnections.find(ac => ac.id === conn.id)) {
                                allConnections.push({ ...conn, planTitle: p.title });
                            }
                        }
                    }
                }

                if (allConnections.length === 0) return null;

                const deviceConnections = allConnections.filter(c => c.type === 'CABLE_CONNECTION' || !c.metadata?.is_free_line);
                const freeLines = allConnections.filter(c => c.type === 'FREE_LINE' || c.metadata?.is_free_line);

                return (
                    <Page size="A4" orientation="landscape" style={{ ...styles.page, padding: 24 }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottomWidth: 2, borderBottomColor: '#0284c7', paddingBottom: 10 }}>
                            <View>
                                <Text style={{ fontSize: 18, fontWeight: 'black', color: '#0f172a' }}>
                                    KABELZUGLISTE & VERBINDUNGSÜBERSICHT
                                </Text>
                                <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                    Projekt: {projectTitle || 'Projekt'} | Erstellt am: {new Date().toLocaleDateString('de-DE')}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <View style={{ backgroundColor: '#e0f2fe', borderWidth: 1, borderColor: '#0284c7', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#0369a1' }}>
                                        Verbindungen: {deviceConnections.length}
                                    </Text>
                                </View>
                                {freeLines.length > 0 && (
                                    <View style={{ backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#f59e0b', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#b45309' }}>
                                            Freie Leitungen: {freeLines.length}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Table Header */}
                        <View style={{ flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 4 }}>
                            <Text style={{ width: '12%', fontSize: 9, fontWeight: 'black', color: '#ffffff' }}>KABEL-NR.</Text>
                            <Text style={{ width: '22%', fontSize: 9, fontWeight: 'black', color: '#ffffff' }}>VON (QUELLE)</Text>
                            <Text style={{ width: '22%', fontSize: 9, fontWeight: 'black', color: '#ffffff' }}>NACH (ZIEL)</Text>
                            <Text style={{ width: '20%', fontSize: 9, fontWeight: 'black', color: '#ffffff' }}>KABELTYP</Text>
                            <Text style={{ width: '10%', fontSize: 9, fontWeight: 'black', color: '#ffffff', textAlign: 'right' }}>LÄNGE</Text>
                            <Text style={{ width: '14%', fontSize: 9, fontWeight: 'black', color: '#ffffff', textAlign: 'right' }}>STATUS / ZWECK</Text>
                        </View>

                        {/* Table Rows - Device Connections */}
                        {deviceConnections.map((conn, idx) => {
                            const m = conn.metadata || {};
                            const sourceLabel = m.source_device_label || 'Gerät A';
                            const targetLabel = m.target_device_label || 'Gerät B';
                            const sourcePlan = m.source_plan_title || conn.planTitle || '';
                            const targetPlan = m.target_plan_title || conn.planTitle || '';
                            const isCrossPlan = sourcePlan && targetPlan && sourcePlan !== targetPlan;

                            return (
                                <View
                                    key={conn.id || idx}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                        borderBottomWidth: 1,
                                        borderBottomColor: '#e2e8f0',
                                        paddingVertical: 6,
                                        paddingHorizontal: 8,
                                    }}
                                >
                                    <Text style={{ width: '12%', fontSize: 9.5, fontWeight: 'bold', color: '#0284c7' }}>
                                        {m.cable_number || conn.name || \`K-\${idx + 1}\`}
                                    </Text>
                                    <View style={{ width: '22%' }}>
                                        <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: '#1e293b' }}>{sourceLabel}</Text>
                                        {sourcePlan && (
                                            <Text style={{ fontSize: 7.5, color: '#64748b' }}>[{sourcePlan}]</Text>
                                        )}
                                    </View>
                                    <View style={{ width: '22%' }}>
                                        <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: '#1e293b' }}>{targetLabel}</Text>
                                        {targetPlan && (
                                            <Text style={{ fontSize: 7.5, color: isCrossPlan ? '#ea580c' : '#64748b', fontWeight: isCrossPlan ? 'bold' : 'normal' }}>
                                                [{targetPlan}] {isCrossPlan ? '⚡' : ''}
                                            </Text>
                                        )}
                                    </View>
                                    <Text style={{ width: '20%', fontSize: 9, fontWeight: 'bold', color: '#334155' }}>
                                        {m.cable_type || 'NYY-J 5x2,5 mm²'}
                                    </Text>
                                    <Text style={{ width: '10%', fontSize: 9, fontWeight: 'bold', color: '#0f172a', textAlign: 'right' }}>
                                        {m.length_meters ? \`\${m.length_meters} m\` : '—'}
                                    </Text>
                                    <Text style={{ width: '14%', fontSize: 8.5, color: '#64748b', textAlign: 'right' }}>
                                        {m.description || m.status || 'Geplant'}
                                    </Text>
                                </View>
                            );
                        })}

                        {/* Free Lines Section */}
                        {freeLines.length > 0 && (
                            <View style={{ marginTop: 14 }}>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#b45309', marginBottom: 4, textTransform: 'uppercase' }}>
                                    Freie Leitungen / Nicht zugewiesene Trassen ({freeLines.length}):
                                </Text>
                                {freeLines.map((fl, flIdx) => {
                                    const m = fl.metadata || {};
                                    return (
                                        <View
                                            key={fl.id || flIdx}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                backgroundColor: flIdx % 2 === 0 ? '#fffbeb' : '#ffffff',
                                                borderBottomWidth: 1,
                                                borderBottomColor: '#fde68a',
                                                paddingVertical: 5,
                                                paddingHorizontal: 8,
                                            }}
                                        >
                                            <Text style={{ width: '12%', fontSize: 9, fontWeight: 'bold', color: '#d97706' }}>
                                                {m.cable_number || fl.name || \`L-\${flIdx + 1}\`}
                                            </Text>
                                            <Text style={{ width: '44%', fontSize: 9, color: '#451a03' }}>
                                                {m.description || fl.name || 'Freie Leitung'}
                                            </Text>
                                            <Text style={{ width: '20%', fontSize: 9, fontWeight: 'bold', color: '#78350f' }}>
                                                {m.cable_type || '—'}
                                            </Text>
                                            <Text style={{ width: '10%', fontSize: 9, fontWeight: 'bold', color: '#92400e', textAlign: 'right' }}>
                                                {m.length_meters ? \`\${m.length_meters} m\` : '—'}
                                            </Text>
                                            <Text style={{ width: '14%', fontSize: 8.5, color: '#a16207', textAlign: 'right' }}>
                                                [{fl.planTitle || 'Plan'}]
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </Page>
                );
            })()}`;

if (!content.includes("PAGE: KABELZUGLISTE & VERBINDUNGSÜBERSICHT")) {
  content = content.replace(
    "</Document>",
    kabelzuglistePageCode + "\n        </Document>"
  );
}

fs.writeFileSync(pdfPath, content, "utf8");
console.log("Updated PlanElementsPdf.tsx with Cables & Kabelzugliste!");
