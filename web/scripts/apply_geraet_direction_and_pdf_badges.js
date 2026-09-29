const fs = require('fs');
const path = require('path');

console.log('=== APPLYING GERAET_BOX FIXED SIZE + DIRECTION & PDF LABELS FIXES ===');

// 1. UPDATE PlanElementsPdf.tsx
const pdfPath = path.join(__dirname, '../src/app/reports/PlanElementsPdf.tsx');
let pdfContent = fs.readFileSync(pdfPath, 'utf8');

// Update geraet_box rendering in PDF to respect orientation
const pdfGeraetBoxOld = `                                {plan.bmaSymbols.filter(s => isSymbolIncluded(s.symbol_type, options) && s.symbol_type === 'geraet_box').map((s) => {
                                    let w_norm = 0.06;
                                    let h_norm = 0.035;`;

const pdfGeraetBoxNew = `                                {plan.bmaSymbols.filter(s => isSymbolIncluded(s.symbol_type, options) && s.symbol_type === 'geraet_box').map((s) => {
                                    let w_norm = 0.06;
                                    let h_norm = 0.035;
                                    try {
                                        const pObj = JSON.parse(s.description || '{}');
                                        if (pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht') {
                                            w_norm = 0.035; h_norm = 0.06;
                                        } else if (pObj.orientation === 'waagerecht' || pObj.direction === 'waagerecht') {
                                            w_norm = 0.06; h_norm = 0.035;
                                        }
                                    } catch {}`;

if (pdfContent.includes(pdfGeraetBoxOld)) {
    pdfContent = pdfContent.replace(pdfGeraetBoxOld, pdfGeraetBoxNew);
    console.log('✓ Updated PDF geraet_box orientation support');
}

// Update cable line offset in PDF to 10px spacing
pdfContent = pdfContent.replace(
    /const ox = \(-dy \/ len\) \* perp \* \d+(\.\d+)?;/,
    'const ox = (-dy / len) * perp * 10;'
).replace(
    /const oy = \(dx \/ len\) \* perp \* \d+(\.\d+)?;/,
    'const oy = (dx / len) * perp * 10;'
);

// Ensure Cable Badges block is at the very end of plan container View (after photo pins)
const photoPinsEndTarget = `                            {/* Photo Pin Number Badges */}
                            {options.includePhotoPins && plan.photoPins.map((p, idx) => {
                                const cx = mapX(p.x_norm);
                                const cy = mapY(p.y_norm);
                                return (
                                    <View
                                        key={p.id}
                                        style={{
                                            position: 'absolute',
                                            left: Math.round(cx - PIN_R),
                                            top: Math.round(cy - PIN_R),
                                            width: PIN_R * 2,
                                            height: PIN_R * 2,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ fontSize: PIN_FONT, color: '#ffffff', fontWeight: 'bold' }}>
                                            {idx + 1}
                                        </Text>
                                    </View>
                                );
                            })}`;

const cableBadgesOnTop = `

                            {/* CABLE NUMBER BADGES: Absolute View rendered LAST — always on top of device icons */}
                            {options.includeCables !== false && (plan.cableConnections ?? [] as any[]).map((c: any, cIdx: number) => {
                                const m = c.metadata || {};
                                const isFree = c.type === 'FREE_LINE' || m.is_free_line;
                                const borderColor = c.color || (isFree ? '#d97706' : '#1d4ed8');
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
                                    if (m.waypoints && Array.isArray(m.waypoints)) { for (const wp of m.waypoints) { pts.push({ x: mapX(wp.x_norm), y: mapY(wp.y_norm) }); } }
                                    pts.push({ x: endX, y: endY });
                                }
                                if (pts.length < 2) return null;

                                // Position label along cable: 25%, 50%, 75%
                                const fracs = [0.25, 0.5, 0.75];
                                let totalLen = 0; const segLens: number[] = [];
                                for (let i = 1; i < pts.length; i++) {
                                    const d = Math.sqrt(Math.pow(pts[i].x - pts[i-1].x, 2) + Math.pow(pts[i].y - pts[i-1].y, 2));
                                    segLens.push(d); totalLen += d;
                                }
                                let target = fracs[cIdx % 3] * totalLen;
                                let lx = pts[0].x, ly = pts[0].y;
                                for (let i = 0; i < segLens.length; i++) {
                                    if (target <= segLens[i]) {
                                        const t = target / (segLens[i] || 1);
                                        lx = pts[i].x + t * (pts[i+1].x - pts[i].x);
                                        ly = pts[i].y + t * (pts[i+1].y - pts[i].y);
                                        break;
                                    }
                                    target -= segLens[i];
                                }

                                // Apply same 10px perpendicular offset as cable line
                                const nCables = plan.cableConnections?.length ?? 1;
                                const perp = cIdx - Math.floor(nCables / 2);
                                if (pts.length >= 2) {
                                    const ddx = pts[1].x - pts[0].x;
                                    const ddy = pts[1].y - pts[0].y;
                                    const llen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                                    lx += (-ddy / llen) * perp * 10;
                                    ly += (ddx / llen) * perp * 10;
                                }

                                const cableNum = m.cable_number || c.name || '';
                                if (!cableNum) return null;

                                const bw = Math.max(24, cableNum.length * 6 + 6);
                                const bh = 13;

                                return (
                                    <View
                                        key={\`cabl-badge-\${c.id || cIdx}\`}
                                        style={{
                                            position: 'absolute',
                                            left: Math.round(lx - bw / 2),
                                            top: Math.round(ly - bh / 2),
                                            width: Math.round(bw),
                                            height: Math.round(bh),
                                            backgroundColor: '#ffffff',
                                            borderWidth: 1,
                                            borderColor: borderColor,
                                            borderRadius: 3,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: '#111827' }}>
                                            {cableNum}
                                        </Text>
                                    </View>
                                );
                            })}`;

if (pdfContent.includes(photoPinsEndTarget) && !pdfContent.includes('CABLE NUMBER BADGES: Absolute View rendered LAST')) {
    pdfContent = pdfContent.replace(photoPinsEndTarget, photoPinsEndTarget + cableBadgesOnTop);
    console.log('✓ Added Cable Badges on top of devices in PDF');
}

fs.writeFileSync(pdfPath, pdfContent);


// 2. UPDATE PlanBmaSymbolsModule.tsx
const modulePath = path.join(__dirname, '../src/components/bma-symbols/PlanBmaSymbolsModule.tsx');
let mod = fs.readFileSync(modulePath, 'utf8');

// Add geraetDirection state if not present
if (!mod.includes('geraetDirection')) {
    mod = mod.replace(
        `const [activeTool, setActiveTool] = useState<null | "cable_connect" | "free_line">(null);`,
        `const [activeTool, setActiveTool] = useState<null | "cable_connect" | "free_line">(null);\n  const [geraetDirection, setGeraetDirection] = useState<'waagerecht' | 'senkrecht'>('waagerecht');`
    );
    console.log('✓ Added geraetDirection state');
}

// Remove 2-click drawing for geraet_box and make it 1-click placement!
const geraetBoxDrawClick = `        if (activeSymbolType === "geraet_box") {
          if (!drawingGeraetBoxStart) {
            setDrawingGeraetBoxStart({ x_norm, y_norm });
            return;
          } else {
            const start = drawingGeraetBoxStart;
            setDrawingGeraetBoxStart(null);
            setHoverLatLng(null);

            const x_min = Math.min(start.x_norm, x_norm);
            const y_min = Math.min(start.y_norm, y_norm);
            const w_norm = Math.max(0.003, Math.abs(x_norm - start.x_norm));
            const h_norm = Math.max(0.003, Math.abs(y_norm - start.y_norm));

            const details = getNextSymbolDetails("geraet_box");
            setLoopInput(details.loop);
            setAddressInput(details.address);
            setLabelInput(details.label);
            setPowerKwInput("");
            setDescriptionInput(JSON.stringify({ w_norm, h_norm, desc: "" }));

            setModalCoords({
              x_norm: x_min,
              y_norm: y_min,
              symbol_type: "geraet_box",
            });
            setSelectedVariantId("");
            setActiveSymbolType(null);
            return;
          }
        }`;

if (mod.includes(geraetBoxDrawClick)) {
    mod = mod.replace(geraetBoxDrawClick, '');
    console.log('✓ Removed 2-click corner drawing requirement for geraet_box (now single-click point placement like warmepumpe)');
}

// Update renderGeraetBox helper to respect orientation
const renderGeraetBoxOld = `      let w_norm = 0.06;
      let h_norm = 0.035;
      let customDesc = "";`;

const renderGeraetBoxNew = `      let w_norm = 0.06;
      let h_norm = 0.035;
      let customDesc = "";
      try {
        const pObj = JSON.parse(s.description || "{}");
        if (pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht') {
          w_norm = 0.035; h_norm = 0.06;
        } else if (pObj.orientation === 'waagerecht' || pObj.direction === 'waagerecht') {
          w_norm = 0.06; h_norm = 0.035;
        }
      } catch {}`;

if (mod.includes(renderGeraetBoxOld)) {
    mod = mod.replace(renderGeraetBoxOld, renderGeraetBoxNew);
    console.log('✓ Updated renderGeraetBox to respect waagerecht vs senkrecht');
}

// Add Geraet Direction Selector in Symbol Modal (when placing or editing geraet_box)
const modalCategorySelectorEnd = `                        <option value="kabelbahn">🛤️ {t("planBma", "kabelbahn", "Kabelbahn (KB)")}</option>
                      </select>
                    </div>`;

const geraetDirectionModalUI = `                        <option value="kabelbahn">🛤️ {t("planBma", "kabelbahn", "Kabelbahn (KB)")}</option>
                      </select>
                    </div>

                    {/* Orientation Selector for Geraet Box (Waagerecht vs Senkrecht) */}
                    {currentType === "geraet_box" && (
                      <div className={styles.inputGroup} style={{ marginBottom: 10 }}>
                        <label className={styles.label}>
                          📐 {t("planBma", "orientationLabel", "Ausrichtung / Format (Gerät / Steuerung):")}
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setGeraetDirection("waagerecht");
                              const w_norm = 0.06; const h_norm = 0.035;
                              try {
                                const p = JSON.parse(descriptionInput || "{}");
                                p.w_norm = w_norm; p.h_norm = h_norm; p.orientation = "waagerecht";
                                setDescriptionInput(JSON.stringify(p));
                              } catch {
                                setDescriptionInput(JSON.stringify({ w_norm, h_norm, orientation: "waagerecht" }));
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "8px 12px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              border: (geraetDirection === "waagerecht" || descriptionInput.includes("waagerecht") || (!descriptionInput.includes("senkrecht") && geraetDirection !== "senkrecht")) ? "2px solid #0284c7" : "1px solid rgba(255,255,255,0.15)",
                              background: (geraetDirection === "waagerecht" || descriptionInput.includes("waagerecht") || (!descriptionInput.includes("senkrecht") && geraetDirection !== "senkrecht")) ? "rgba(2, 132, 199, 0.25)" : "#1e293b",
                              color: (geraetDirection === "waagerecht" || descriptionInput.includes("waagerecht") || (!descriptionInput.includes("senkrecht") && geraetDirection !== "senkrecht")) ? "#38bdf8" : "#94a3b8",
                            }}
                          >
                            <span>⟷ Waagerecht (Quer)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setGeraetDirection("senkrecht");
                              const w_norm = 0.035; const h_norm = 0.06;
                              try {
                                const p = JSON.parse(descriptionInput || "{}");
                                p.w_norm = w_norm; p.h_norm = h_norm; p.orientation = "senkrecht";
                                setDescriptionInput(JSON.stringify(p));
                              } catch {
                                setDescriptionInput(JSON.stringify({ w_norm, h_norm, orientation: "senkrecht" }));
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "8px 12px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              border: (geraetDirection === "senkrecht" || descriptionInput.includes("senkrecht")) ? "2px solid #0284c7" : "1px solid rgba(255,255,255,0.15)",
                              background: (geraetDirection === "senkrecht" || descriptionInput.includes("senkrecht")) ? "rgba(2, 132, 199, 0.25)" : "#1e293b",
                              color: (geraetDirection === "senkrecht" || descriptionInput.includes("senkrecht")) ? "#38bdf8" : "#94a3b8",
                            }}
                          >
                            <span>↕ Senkrecht (Hochkant)</span>
                          </button>
                        </div>
                      </div>
                    )}`;

if (mod.includes(modalCategorySelectorEnd) && !mod.includes('Ausrichtung / Format (Gerät / Steuerung)')) {
    mod = mod.replace(modalCategorySelectorEnd, geraetDirectionModalUI);
    console.log('✓ Added Geraet Direction UI selector in Modal');
}

fs.writeFileSync(modulePath, mod);
console.log('=== ALL FILES SUCCESSFULLY UPDATED ===');
