import re

# 1. Update PlanBmaSymbolsModule.tsx
mod_path = '/home/ubuntu/building-task-manager/web/src/components/bma-symbols/PlanBmaSymbolsModule.tsx'
with open(mod_path, 'r') as f:
    mod = f.read()

# Make sure orientation selector shows for BOTH geraet_box and infrarotheizung
old_cond = '{currentType === "geraet_box" && ('
new_cond = '{(currentType === "geraet_box" || currentType === "infrarotheizung") && ('
if old_cond in mod:
    mod = mod.replace(old_cond, new_cond, 1)
    print("Updated modal orientation selector condition")

# Make sure handleSaveSymbol attaches orientation & w_norm/h_norm to descObj
save_edit_target = 'finalDesc = JSON.stringify(descObj);'
save_edit_replacement = '''if (editingSymbol && (editingSymbol.symbol_type === "geraet_box" || editingSymbol.symbol_type === "infrarotheizung")) {
          descObj.orientation = geraetDirection;
          descObj.direction = geraetDirection;
          if (editingSymbol.symbol_type === "geraet_box") {
            descObj.w_norm = geraetDirection === "senkrecht" ? 0.004 : 0.007;
            descObj.h_norm = geraetDirection === "senkrecht" ? 0.007 : 0.004;
          }
        }
        finalDesc = JSON.stringify(descObj);'''

if save_edit_target in mod and 'editingSymbol.symbol_type === "geraet_box"' not in mod:
    mod = mod.replace(save_edit_target, save_edit_replacement, 1)
    print("Updated editingSymbol save handler with orientation")

save_modal_target = 'const finalDesc = JSON.stringify(descObj);'
save_modal_replacement = '''if (modalCoords && (modalCoords.symbol_type === "geraet_box" || modalCoords.symbol_type === "infrarotheizung")) {
          descObj.orientation = geraetDirection;
          descObj.direction = geraetDirection;
          if (modalCoords.symbol_type === "geraet_box") {
            descObj.w_norm = geraetDirection === "senkrecht" ? 0.004 : 0.007;
            descObj.h_norm = geraetDirection === "senkrecht" ? 0.007 : 0.004;
          }
        }
        const finalDesc = JSON.stringify(descObj);'''

if save_modal_target in mod and 'modalCoords.symbol_type === "geraet_box"' not in mod:
    mod = mod.replace(save_modal_target, save_modal_replacement, 1)
    print("Updated modalCoords save handler with orientation")

# Fix renderGeraetBox default dimensions
mod = re.sub(r'w_norm = 0.02;\s*h_norm = 0.012;', 'w_norm = 0.007; h_norm = 0.004;', mod)
mod = re.sub(r'w_norm = 0.012;\s*h_norm = 0.02;', 'w_norm = 0.004; h_norm = 0.007;', mod)

# Fix getSymbolIcon for infrarotheizung orientation
old_infra_map = '''    } else if (isInfra) {
      w = Math.round(targetSize * 4.5);
      h = Math.round(targetSize * 1.5);
    }'''

new_infra_map = '''    } else if (isInfra) {
      let isSenkrecht = false;
      try {
        const pObj = JSON.parse(desc || "{}");
        if (pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht') isSenkrecht = true;
      } catch {}
      if (isSenkrecht) {
        w = Math.round(targetSize * 1.5);
        h = Math.round(targetSize * 4.5);
      } else {
        w = Math.round(targetSize * 4.5);
        h = Math.round(targetSize * 1.5);
      }
    }'''

if old_infra_map in mod:
    mod = mod.replace(old_infra_map, new_infra_map, 1)
    print("Updated getSymbolIcon infrarotheizung orientation")

with open(mod_path, 'w') as f:
    f.write(mod)


# 2. Update PlanElementsPdf.tsx
pdf_path = '/home/ubuntu/building-task-manager/web/src/app/reports/PlanElementsPdf.tsx'
with open(pdf_path, 'r') as f:
    pdf = f.read()

pdf = re.sub(r'w_norm = 0.02;\s*h_norm = 0.012;', 'w_norm = 0.007; h_norm = 0.004;', pdf)
pdf = re.sub(r'w_norm = 0.012;\s*h_norm = 0.02;', 'w_norm = 0.004; h_norm = 0.007;', pdf)

old_pdf_infra = 'const iconW = isGross ? 26 : isDis ? 18 : isWpAussen ? 30 : isWpInnen ? 45 : isInfra ? 60 : BMA_SIZE;\n                                const iconH = isGross ? 13 : isDis ? 14 : isWpAussen ? 60 : isWpInnen ? 45 : isInfra ? 20 : BMA_SIZE;'

new_pdf_infra = '''const isInfraSenkrecht = (() => {
                                    try {
                                        const pObj = JSON.parse(s.description || '{}');
                                        return pObj.orientation === 'senkrecht' || pObj.direction === 'senkrecht';
                                    } catch { return false; }
                                })();
                                const iconW = isGross ? 26 : isDis ? 18 : isWpAussen ? 30 : isWpInnen ? 45 : isInfra ? (isInfraSenkrecht ? 20 : 60) : BMA_SIZE;
                                const iconH = isGross ? 13 : isDis ? 14 : isWpAussen ? 60 : isWpInnen ? 45 : isInfra ? (isInfraSenkrecht ? 60 : 20) : BMA_SIZE;'''

if old_pdf_infra in pdf:
    pdf = pdf.replace(old_pdf_infra, new_pdf_infra, 1)
    print("Updated PDF infrarotheizung orientation")

with open(pdf_path, 'w') as f:
    f.write(pdf)

print("Python fixes applied successfully")
