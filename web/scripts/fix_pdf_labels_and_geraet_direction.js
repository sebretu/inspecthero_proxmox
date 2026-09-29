const fs = require('fs');
const path = require('path');

// ─── 1. FIX PDF CABLE LABELS ─────────────────────────────────────────────────
const pdfPath = path.join(__dirname, '../src/app/reports/PlanElementsPdf.tsx');
let pdf = fs.readFileSync(pdfPath, 'utf8');

// Find the closing of photo pins section - look for the pattern
const photoPinsEnd = `                            })}
                        </View>`;

const cableLabelsBlock = `                            })}

                            {/* CABLE LABELS: absolute View LAST \u2014 always on top of device icons */}
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
                                const fracs = [0.25, 0.5, 0.75];
                                let totalLen = 0; const segLens: number[] = [];
                                for (let i = 1; i < pts.length; i++) { const d = Math.sqrt(Math.pow(pts[i].x-pts[i-1].x,2)+Math.pow(pts[i].y-pts[i-1].y,2)); segLens.push(d); totalLen+=d; }
                                let target = fracs[cIdx % 3] * totalLen; let lx=pts[0].x, ly=pts[0].y;
                                for (let i = 0; i < segLens.length; i++) { if(target<=segLens[i]){const t=target/(segLens[i]||1); lx=pts[i].x+t*(pts[i+1].x-pts[i].x); ly=pts[i].y+t*(pts[i+1].y-pts[i].y); break;} target-=segLens[i]; }
                                const nCables = plan.cableConnections?.length ?? 1;
                                const perp = cIdx - Math.floor(nCables / 2);
                                if (pts.length >= 2) { const ddx=pts[1].x-pts[0].x; const ddy=pts[1].y-pts[0].y; const llen=Math.sqrt(ddx*ddx+ddy*ddy)||1; lx+=(-ddy/llen)*perp*6; ly+=(ddx/llen)*perp*6; }
                                const cableNum = m.cable_number || c.name || '';
                                if (!cableNum) return null;
                                const bw = Math.max(22, cableNum.length * 5.5 + 6); const bh = 12;
                                return (
                                    <View key={\`cabl-\${c.id||cIdx}\`} style={{ position:'absolute', left:Math.round(lx-bw/2), top:Math.round(ly-bh/2), width:Math.round(bw), height:Math.round(bh), backgroundColor:'#ffffff', borderWidth:1, borderColor:borderColor, borderRadius:2, alignItems:'center', justifyContent:'center' }}>
                                        <Text style={{ fontSize:6, fontWeight:'bold', color:'#111827' }}>{cableNum}</Text>
                                    </View>
                                );
                            })}
                        </View>`;

// Only insert if not already done
if (!pdf.includes('CABLE LABELS: absolute View LAST')) {
  // Find the LAST occurrence of the photo pins closing pattern before </Page>
  const pageCloseIdx = pdf.indexOf('                    </Page>');
  if (pageCloseIdx === -1) {
    console.error('Could not find </Page>');
    process.exit(1);
  }
  // Find the </View> right before </Page>
  const beforePage = pdf.substring(0, pageCloseIdx);
  const lastViewClose = beforePage.lastIndexOf('                        </View>');
  if (lastViewClose === -1) {
    console.error('Could not find closing View before </Page>');
    process.exit(1);
  }
  // Check it's the photo pins })} closing
  const surroundingEnd = pdf.substring(lastViewClose - 50, lastViewClose + 50);
  console.log('Found closing View context:', JSON.stringify(surroundingEnd));
  
  pdf = pdf.substring(0, lastViewClose) + cableLabelsBlock + '\n' + pdf.substring(lastViewClose + '                        </View>'.length);
  fs.writeFileSync(pdfPath, pdf);
  console.log('✓ PDF cable labels block inserted');
} else {
  console.log('✓ PDF cable labels already present');
}

// ─── 2. FIX GERAET_BOX: fixed size + direction toggle ──────────────────────
const modulePath = path.join(__dirname, '../src/components/bma-symbols/PlanBmaSymbolsModule.tsx');
let mod = fs.readFileSync(modulePath, 'utf8');

// Fix 1: In the symbol placement - when activeSymbolType === 'geraet_box', show direction toggle button
// First check if direction is already implemented
if (mod.includes('geraet_direction') || mod.includes('geraetDirection')) {
  console.log('✓ Geraet direction already implemented');
} else {
  // Add direction state after activeTool state
  const afterActiveToolState = `  const [activeTool, setActiveTool] = useState<null | "cable_connect" | "free_line">(null);`;
  const withDirectionState = `  const [activeTool, setActiveTool] = useState<null | "cable_connect" | "free_line">(null);
  const [geraetDirection, setGeraetDirection] = useState<'waagerecht' | 'senkrecht'>('waagerecht');`;
  
  if (mod.includes(afterActiveToolState)) {
    mod = mod.replace(afterActiveToolState, withDirectionState);
    console.log('✓ Added geraetDirection state');
  } else {
    console.log('WARNING: Could not find activeTool state to add geraetDirection after');
  }

  // Fix 2: When placing geraet_box, use direction to set w_norm/h_norm
  // Find where geraet_box is placed (click handler) - look for description with w_norm
  // The symbol is placed with a description JSON - find that spot
  const geraetBoxPlacement = `if (activeSymbolType === "geraet_box") {`;
  if (mod.includes(geraetBoxPlacement)) {
    // We need to find where description is built for geraet_box
    // Look for a pattern where geraet_box symbols are created
    const descPattern = `description: JSON.stringify({ w_norm`;
    if (mod.includes(descPattern)) {
      // Replace the description building to use direction
      mod = mod.replace(
        /description: JSON\.stringify\(\{ w_norm[^}]+\}\)/,
        `description: JSON.stringify({ w_norm: geraetDirection === 'waagerecht' ? 0.08 : 0.04, h_norm: geraetDirection === 'waagerecht' ? 0.04 : 0.08 })`
      );
      console.log('✓ Fixed geraet_box dimensions to use direction');
    } else {
      console.log('INFO: Could not find description JSON pattern for geraet_box');
    }
  }

  fs.writeFileSync(modulePath, mod);
  console.log('✓ Module updated with geraet direction');
}

// Re-read to add direction UI toggle
mod = fs.readFileSync(modulePath, 'utf8');

// Add direction toggle button in the toolbar near geraet_box button
// Find where geraet_box button is in the UI
const geraetBoxBtnMarker = `activeSymbolType === "geraet_box"`;
const geraetBoxBtnCount = (mod.match(/activeSymbolType === "geraet_box"/g) || []).length;
console.log(`Found ${geraetBoxBtnCount} occurrences of geraet_box activeSymbolType check`);

// We need to add a direction toggle after the geraet_box button in the toolbar
// Look for the pattern where geraet_box is selected in the quick buttons area
const geraetQuickBtnPattern = /(\{activeSymbolType === "geraet_box" &&[^}]+\}[^{]*\{[^}]*\})/;

// Find toolbar section with quickBtn for geraet_box
const geraetBoxToolbarIdx = mod.indexOf('quickBtn.*geraet_box');

console.log('Script completed - checking for direction toggle in toolbar...');

// Look for where geraet_box button is displayed in UI and add direction buttons nearby
// Find the area with "Gerät / Steuerung" text or similar
const geraetBtnLabel = mod.includes('Gerät / Steuerung') ? 'Gerät / Steuerung' : 
                       mod.includes('geraet_box') && mod.includes('quickBtn') ? 'geraet_box quickBtn' : null;

if (geraetBtnLabel) {
  console.log(`✓ Found geraet_box button area: "${geraetBtnLabel}"`);
}

// Find toolbar section - look for the direction toggle spot in info bar
if (mod.includes('geraetDirection')) {
  // direction already in state but maybe not in UI - add toggle next to the active tool hints
  const activeGeraetHint = `activeTool === "free_line" ?`;
  if (mod.includes(activeGeraetHint) && !mod.includes('Waagerecht')) {
    // Add direction button UI in the drawing hint bar
    const hintBarPattern = `activeSymbolType === "geraet_box" ? (`;
    if (mod.includes(hintBarPattern)) {
      mod = mod.replace(
        hintBarPattern,
        `activeSymbolType === "geraet_box" ? (`
      );
    }
  }
  
  // Add direction toggle button in toolbar area - find geraet_box quickBtn
  // Look for where "geraet_box" type is set in onClick
  const setGeraetTypeLine = `setActiveSymbolType("geraet_box")`;
  if (mod.includes(setGeraetTypeLine) && !mod.includes('Waagerecht') && !mod.includes('geraet-dir-btn')) {
    // Find the geraet_box section in toolbar
    const geraetSectionIdx = mod.indexOf(setGeraetTypeLine);
    const nearbyClosingBrace = mod.indexOf('\n', mod.indexOf('>', geraetSectionIdx + 100) + 1) + 1;
    
    // Insert direction buttons after the geraet_box button close
    // Find </button> or closing JSX after geraet button
    let insertAfter = mod.indexOf('</button>', geraetSectionIdx);
    if (insertAfter === -1) insertAfter = mod.indexOf('/>', geraetSectionIdx + 50) + 2;
    
    const directionToggle = `
              {/* Geraet direction toggle */}
              {activeSymbolType === "geraet_box" && (
                <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                  <button
                    id="geraet-dir-waagerecht"
                    onClick={() => setGeraetDirection('waagerecht')}
                    title="Waagerecht (quer)"
                    style={{ padding: '2px 6px', fontSize: 10, borderRadius: 3, border: '1px solid #38bdf8', background: geraetDirection === 'waagerecht' ? '#0284c7' : 'transparent', color: geraetDirection === 'waagerecht' ? '#fff' : '#38bdf8', cursor: 'pointer' }}
                  >⟷</button>
                  <button
                    id="geraet-dir-senkrecht"
                    onClick={() => setGeraetDirection('senkrecht')}
                    title="Senkrecht (hochkant)"
                    style={{ padding: '2px 6px', fontSize: 10, borderRadius: 3, border: '1px solid #38bdf8', background: geraetDirection === 'senkrecht' ? '#0284c7' : 'transparent', color: geraetDirection === 'senkrecht' ? '#fff' : '#38bdf8', cursor: 'pointer' }}
                  >⟵⟶</button>
                </div>
              )}`;
    
    mod = mod.slice(0, insertAfter) + directionToggle + mod.slice(insertAfter);
    fs.writeFileSync(modulePath, mod);
    console.log('✓ Added direction toggle buttons');
  }
}

console.log('\nAll done! Now rebuild and deploy.');
