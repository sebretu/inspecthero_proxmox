import re

mod_path = '/home/ubuntu/building-task-manager/web/src/components/bma-symbols/PlanBmaSymbolsModule.tsx'
with open(mod_path, 'r') as f:
    mod = f.read()

# Replace lines 3361-3422 with proper indentation and closed brackets
new_block = '''                  {(() => {
                    let cleanDesc = "";
                    let extraBadge: React.ReactNode = null;
                    if (s.description) {
                      if (s.description.startsWith("{")) {
                        try {
                          const parsed = JSON.parse(s.description);
                          cleanDesc = parsed.desc || "";
                          if (parsed.powerKw) {
                            extraBadge = (
                              <>
                                {extraBadge}
                                <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, marginTop: 2 }}>
                                  ⚡ {parsed.powerKw.includes('kW') ? parsed.powerKw : parsed.powerKw + ' kW'}
                                </div>
                              </>
                            );
                          }
                          if (parsed.zuleitung) {
                            extraBadge = (
                              <>
                                {extraBadge}
                                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>
                                  🔌 {parsed.zuleitung}
                                </div>
                              </>
                            );
                          }
                          if (parsed.variantName) {
                            extraBadge = (
                              <>
                                {extraBadge}
                                <div style={{ fontSize: 10, color: "#38bdf8", fontWeight: 700, marginTop: 2 }}>
                                  {parsed.variantName}
                                </div>
                              </>
                            );
                          }
                          if (parsed.direction) {
                            const dirLabels: Record<string, string> = {
                              left: t("planBma", "dirLeft", "Links ⬅"),
                              right: t("planBma", "dirRight", "Rechts ➔"),
                              down: t("planBma", "dirDown", "Unten ⬇"),
                              up: t("planBma", "dirUp", "Oben ⬆"),
                            };
                            extraBadge = (
                              <>
                                {extraBadge}
                                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                  {t("planBma", "directionLabel", "Richtung")}: <b style={{ color: "#4ade80" }}>{dirLabels[parsed.direction] || parsed.direction}</b>
                                </div>
                              </>
                            );
                          }
                        } catch {}
                      } else {
                        cleanDesc = s.description;
                      }
                    }
                    return (
                      <>
                        {extraBadge}
                        {cleanDesc && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{cleanDesc}</div>
                        )}
                      </>
                    );
                  })()}'''

mod = re.sub(r'\{\(\(\) => \{\s*let cleanDesc = "";[\s\S]*?\}\)\(\)\}', new_block, mod, count=1)

with open(mod_path, 'w') as f:
    f.write(mod)

print("Fixed PlanBmaSymbolsModule.tsx syntax successfully")
