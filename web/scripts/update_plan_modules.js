const fs = require("fs");
const path = require("path");

// 1. Update PlanBmaSymbolsModule.tsx
const bmaModPath = path.join(__dirname, "../src/components/bma-symbols/PlanBmaSymbolsModule.tsx");
let bmaContent = fs.readFileSync(bmaModPath, "utf8");

if (!bmaContent.includes("const [zuleitungInput, setZuleitungInput]")) {
  bmaContent = bmaContent.replace(
    'const [powerKwInput, setPowerKwInput] = useState("");',
    'const [powerKwInput, setPowerKwInput] = useState("");\n  const [zuleitungInput, setZuleitungInput] = useState("");'
  );
}

if (!bmaContent.includes("setZuleitungInput(parsed.zuleitung")) {
  bmaContent = bmaContent.replace(
    'if (parsed.powerKw) initPowerKw = parsed.powerKw;',
    'if (parsed.powerKw) initPowerKw = parsed.powerKw;\n        if (parsed.zuleitung) setZuleitungInput(parsed.zuleitung);\n        else setZuleitungInput("");'
  );
}

if (!bmaContent.includes("descObj.zuleitung = zuleitungInput.trim()")) {
  bmaContent = bmaContent.replace(
    'if (powerKwInput.trim()) {\n          descObj.powerKw = powerKwInput.trim();\n        } else {\n          delete descObj.powerKw;\n        }',
    'if (powerKwInput.trim()) {\n          descObj.powerKw = powerKwInput.trim();\n        } else {\n          delete descObj.powerKw;\n        }\n        if (zuleitungInput.trim()) {\n          descObj.zuleitung = zuleitungInput.trim();\n        } else {\n          delete descObj.zuleitung;\n        }'
  );
}

if (!bmaContent.includes("descObj.zuleitung = zuleitungInput.trim();") && bmaContent.includes("if (powerKwInput.trim()) {\n          descObj.powerKw = powerKwInput.trim();\n        }\n\n        const finalDesc = JSON.stringify(descObj);")) {
  bmaContent = bmaContent.replace(
    'if (powerKwInput.trim()) {\n          descObj.powerKw = powerKwInput.trim();\n        }\n\n        const finalDesc = JSON.stringify(descObj);',
    'if (powerKwInput.trim()) {\n          descObj.powerKw = powerKwInput.trim();\n        }\n        if (zuleitungInput.trim()) {\n          descObj.zuleitung = zuleitungInput.trim();\n        }\n\n        const finalDesc = JSON.stringify(descObj);'
  );
}

// Add Zuleitung input field into modal right below powerKw input
const zuleitungInputUi = `
                    {/* Cable type / Supply line (Zuleitung) input */}
                    <div className={styles.inputGroup}>
                      <label className={styles.label}>
                        🔌 {t("planBma", "zuleitung", "Kabeltyp / Zuleitung (z.B. NYY-J 5x2.5)")}
                      </label>
                      <input
                        type="text"
                        className={styles.input}
                        value={zuleitungInput}
                        onChange={(e) => setZuleitungInput(e.target.value)}
                        placeholder={t("planBma", "zuleitungPlaceholder", "z.B. NYY-J 5x2.5 mm² / ÖLFLEX 4x1.5 mm²")}
                      />
                    </div>`;

if (!bmaContent.includes("zuleitungPlaceholder") && bmaContent.includes('placeholder={t("planBma", "powerKwPlaceholder", "np. 12 kW / 8.5 kW")}\n                      />\n                    </div>')) {
  bmaContent = bmaContent.replace(
    'placeholder={t("planBma", "powerKwPlaceholder", "np. 12 kW / 8.5 kW")}\n                      />\n                    </div>',
    'placeholder={t("planBma", "powerKwPlaceholder", "np. 12 kW / 8.5 kW")}\n                      />\n                    </div>' + zuleitungInputUi
  );
}

fs.writeFileSync(bmaModPath, bmaContent, "utf8");
console.log("Updated PlanBmaSymbolsModule.tsx with Zuleitung!");

// 2. Update PlanElementsPdf.tsx
const pdfPath = path.join(__dirname, "../src/app/reports/PlanElementsPdf.tsx");
let pdfContent = fs.readFileSync(pdfPath, "utf8");

// Update AufkleberItem type
if (!pdfContent.includes("zuleitung?: string;")) {
  pdfContent = pdfContent.replace(
    "export type AufkleberItem = {",
    "export type AufkleberItem = {\n    zuleitung?: string;\n    powerKw?: string;\n    isHeating?: boolean;"
  );
}

// Update extractAndSortAufkleberItems extraction
if (!pdfContent.includes("let zuleitung = '';")) {
  pdfContent = pdfContent.replace(
    "let variantColor: string | null = null;",
    "let variantColor: string | null = null;\n            let zuleitung = '';\n            let powerKw = '';"
  );
  pdfContent = pdfContent.replace(
    "if (parsed.variantModel) variantModel = parsed.variantModel;",
    "if (parsed.variantModel) variantModel = parsed.variantModel;\n                if (parsed.powerKw) powerKw = parsed.powerKw;\n                if (parsed.zuleitung) zuleitung = parsed.zuleitung;"
  );
  pdfContent = pdfContent.replace(
    "photoBase64: photoBase64 || undefined,",
    "photoBase64: photoBase64 || undefined,\n                zuleitung: zuleitung || undefined,\n                powerKw: powerKw || undefined,\n                isHeating: s.symbol_type === 'warmepumpe_aussen' || s.symbol_type === 'warmepumpe_innen' || s.symbol_type === 'infrarotheizung' || s.symbol_type === 'geraet_box',"
  );
}

// Update VariantGroupDisplay type
if (!pdfContent.includes("isHeating?: boolean;\n                    zuleitung?: string;")) {
  pdfContent = pdfContent.replace(
    "iconKey: string;\n                };",
    "iconKey: string;\n                    isHeating?: boolean;\n                    zuleitung?: string;\n                    powerKw?: string;\n                };"
  );
}

// Update variantGroups creation
if (!pdfContent.includes("isHeating: v.category === 'warmepumpe_aussen'")) {
  pdfContent = pdfContent.replace(
    "iconKey: v.category || 'notlicht_lampe',\n                            });",
    `iconKey: v.category || 'notlicht_lampe',
                                isHeating: v.category === 'warmepumpe_aussen' || v.category === 'warmepumpe_innen' || v.category === 'infrarotheizung' || v.category === 'geraet_box',
                                powerKw: matched.find(m => m.powerKw)?.powerKw || (v as any).powerKw,
                                zuleitung: matched.find(m => m.zuleitung)?.zuleitung || (v as any).zuleitung,
                            });`
  );

  pdfContent = pdfContent.replace(
    "iconKey: 'warmepumpe_aussen',\n                        });",
    `iconKey: 'warmepumpe_aussen',
                            isHeating: true,
                            powerKw: matched.find(m => m.powerKw)?.powerKw || combinedLampTypes.warmepumpe_aussen?.powerKw,
                            zuleitung: matched.find(m => m.zuleitung)?.zuleitung || combinedLampTypes.warmepumpe_aussen?.zuleitung,
                        });`
  );

  pdfContent = pdfContent.replace(
    "iconKey: 'warmepumpe_innen',\n                        });",
    `iconKey: 'warmepumpe_innen',
                            isHeating: true,
                            powerKw: matched.find(m => m.powerKw)?.powerKw || combinedLampTypes.warmepumpe_innen?.powerKw,
                            zuleitung: matched.find(m => m.zuleitung)?.zuleitung || combinedLampTypes.warmepumpe_innen?.zuleitung,
                        });`
  );

  pdfContent = pdfContent.replace(
    "iconKey: 'infrarotheizung',\n                        });",
    `iconKey: 'infrarotheizung',
                            isHeating: true,
                            powerKw: matched.find(m => m.powerKw)?.powerKw || combinedLampTypes.infrarotheizung?.powerKw,
                            zuleitung: matched.find(m => m.zuleitung)?.zuleitung || combinedLampTypes.infrarotheizung?.zuleitung,
                        });`
  );

  pdfContent = pdfContent.replace(
    "iconKey: 'geraet_box',\n                        });",
    `iconKey: 'geraet_box',
                            isHeating: true,
                            powerKw: matched.find(m => m.powerKw)?.powerKw || combinedLampTypes.geraet_box?.powerKw,
                            zuleitung: matched.find(m => m.zuleitung)?.zuleitung || combinedLampTypes.geraet_box?.zuleitung,
                        });`
  );
}

// Update card UI rendering so heating & devices do NOT say "Zugeordnete Leuchten-Nummern"
const oldCardDetails = `{/* Details */}
                                            <View style={{ flex: 1, gap: 4 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: grp.color }} />
                                                    <Text style={{ fontSize: 13, fontWeight: 'black', color: grp.color, textTransform: 'uppercase' }}>
                                                        {grp.title} ({grp.count} Stück)
                                                    </Text>
                                                </View>
                                                <Text style={{ fontSize: 15, fontWeight: 'black', color: '#0f172a' }}>
                                                    {grp.model}
                                                </Text>
                                                {grp.notes && (
                                                    <Text style={{ fontSize: 10.5, color: '#64748b' }}>{grp.notes}</Text>
                                                )}
                                                {grp.stickerNumbers.length > 0 && (
                                                    <View style={{ marginTop: 4, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                                        <Text style={{ fontSize: 10.5, color: '#166534', fontWeight: 'bold' }}>
                                                            Zugeordnete Leuchten-Nummern ({grp.stickerNumbers.length}):
                                                        </Text>
                                                        <Text style={{ fontSize: 9.5, color: '#15803d', marginTop: 2 }}>
                                                            {grp.stickerNumbers.join(', ')}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>`;

const newCardDetails = `{/* Details */}
                                            {grp.isHeating ? (
                                                <View style={{ flex: 1, gap: 3 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: grp.color }} />
                                                        <Text style={{ fontSize: 13, fontWeight: 'black', color: grp.color, textTransform: 'uppercase' }}>
                                                            {grp.title} ({grp.count} Stück)
                                                        </Text>
                                                    </View>
                                                    <Text style={{ fontSize: 14, fontWeight: 'black', color: '#0f172a' }}>
                                                        {grp.model}
                                                    </Text>
                                                    {grp.powerKw && (
                                                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0284c7' }}>
                                                            ⚡ Leistung: {grp.powerKw.includes('kW') ? grp.powerKw : grp.powerKw + ' kW'}
                                                        </Text>
                                                    )}
                                                    {grp.zuleitung && (
                                                        <Text style={{ fontSize: 10.5, fontWeight: 'bold', color: '#475569' }}>
                                                            🔌 Zuleitung: {grp.zuleitung}
                                                        </Text>
                                                    )}
                                                    {grp.notes && (
                                                        <Text style={{ fontSize: 10, color: '#64748b' }}>{grp.notes}</Text>
                                                    )}
                                                    {grp.stickerNumbers.length > 0 && (
                                                        <View style={{ marginTop: 4, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                                            <Text style={{ fontSize: 10.5, color: '#0369a1', fontWeight: 'bold' }}>
                                                                Zugeordnete Geräte-Kennzeichnungen ({grp.stickerNumbers.length}):
                                                            </Text>
                                                            <Text style={{ fontSize: 9.5, color: '#0284c7', marginTop: 2, fontWeight: 'bold' }}>
                                                                {grp.stickerNumbers.join(', ')}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            ) : (
                                                <View style={{ flex: 1, gap: 4 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: grp.color }} />
                                                        <Text style={{ fontSize: 13, fontWeight: 'black', color: grp.color, textTransform: 'uppercase' }}>
                                                            {grp.title} ({grp.count} Stück)
                                                        </Text>
                                                    </View>
                                                    <Text style={{ fontSize: 15, fontWeight: 'black', color: '#0f172a' }}>
                                                        {grp.model}
                                                    </Text>
                                                    {grp.notes && (
                                                        <Text style={{ fontSize: 10.5, color: '#64748b' }}>{grp.notes}</Text>
                                                    )}
                                                    {grp.stickerNumbers.length > 0 && (
                                                        <View style={{ marginTop: 4, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                                                            <Text style={{ fontSize: 10.5, color: '#166534', fontWeight: 'bold' }}>
                                                                Zugeordnete Leuchten-Nummern ({grp.stickerNumbers.length}):
                                                            </Text>
                                                            <Text style={{ fontSize: 9.5, color: '#15803d', marginTop: 2 }}>
                                                                {grp.stickerNumbers.join(', ')}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            )}`;

if (pdfContent.includes(oldCardDetails)) {
  pdfContent = pdfContent.replace(oldCardDetails, newCardDetails);
}

fs.writeFileSync(pdfPath, pdfContent, "utf8");
console.log("Updated PlanElementsPdf.tsx with Heating / Device separation and Zuleitung!");
