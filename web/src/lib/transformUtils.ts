import { SupabaseClient } from "@supabase/supabase-js";

export async function applyTransformMatrixToPlan(planId: string, matrix: any, supabase: SupabaseClient) {
  if (!matrix || !matrix.matrix) return;
  const m = matrix.matrix; // [ [m00, m01, tx], [m10, m11, ty] ]
  const m00 = m[0][0]; const m01 = m[0][1]; const tx = m[0][2];
  const m10 = m[1][0]; const m11 = m[1][1]; const ty = m[1][2];

  const { error } = await supabase.rpc('apply_transform_to_plan_pins', {
    p_plan_id: planId,
    m00,
    m01,
    tx,
    m10,
    m11,
    ty
  });

  if (error) {
    console.error("[applyTransformMatrixToPlan] RPC failed:", error);
    throw new Error(error.message);
  }
}

export function solveTransformation(
  v_old_anchors: { x: number; y: number }[],
  v_draft_anchors: { x: number; y: number }[]
) {
  const N = v_old_anchors.length;
  if (N < 2) {
    throw new Error("At least 2 reference points are required.");
  }
  if (v_draft_anchors.length !== N) {
    throw new Error("Matching number of old and draft reference points is required.");
  }

  if (N === 2) {
    // 2-point similarity transform
    const oA = v_old_anchors[0];
    const oB = v_old_anchors[1];
    const dA = v_draft_anchors[0];
    const dB = v_draft_anchors[1];

    const dxO = oB.x - oA.x;
    const dyO = oB.y - oA.y;
    const dxD = dB.x - dA.x;
    const dyD = dB.y - dA.y;

    const distO = Math.sqrt(dxO * dxO + dyO * dyO);
    const distD = Math.sqrt(dxD * dxD + dyD * dyD);

    if (distO < 0.0001 || distD < 0.0001) {
      throw new Error(
        "Punkty referencyjne są zbyt blisko siebie. Proszę wybrać punkty bardziej oddalone od siebie."
      );
    }

    const scale = distD / distO;
    const theta = Math.atan2(dyD, dxD) - Math.atan2(dyO, dxO);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const m00 = scale * cosT;
    const m01 = -scale * sinT;
    const m10 = scale * sinT;
    const m11 = scale * cosT;

    const tx = dA.x - (m00 * oA.x + m01 * oA.y);
    const ty = dA.y - (m10 * oA.x + m11 * oA.y);

    return {
      type: "similarity",
      matrix: [
        [m00, m01, tx],
        [m10, m11, ty],
      ],
    };
  } else {
    // N >= 3: least-squares affine transform
    let m00_sum = 0; // x^2
    let m01_sum = 0; // x*y
    let m02_sum = 0; // x
    let m11_sum = 0; // y^2
    let m12_sum = 0; // y
    
    let Yx0 = 0; // x*u
    let Yx1 = 0; // y*u
    let Yx2 = 0; // u

    let Yy0 = 0; // x*v
    let Yy1 = 0; // y*v
    let Yy2 = 0; // v

    for (let i = 0; i < N; i++) {
      const o = v_old_anchors[i];
      const d = v_draft_anchors[i];

      m00_sum += o.x * o.x;
      m01_sum += o.x * o.y;
      m02_sum += o.x;
      m11_sum += o.y * o.y;
      m12_sum += o.y;

      Yx0 += o.x * d.x;
      Yx1 += o.y * d.x;
      Yx2 += d.x;

      Yy0 += o.x * d.y;
      Yy1 += o.y * d.y;
      Yy2 += d.y;
    }

    const M00 = m00_sum;
    const M01 = m01_sum;
    const M02 = m02_sum;
    const M10 = m01_sum;
    const M11 = m11_sum;
    const M12 = m12_sum;
    const M20 = m02_sum;
    const M21 = m12_sum;
    const M22 = N;

    const det = M00 * (M11 * M22 - M12 * M21) -
                M01 * (M10 * M22 - M12 * M20) +
                M02 * (M10 * M21 - M11 * M20);

    if (Math.abs(det) < 1e-9) {
      throw new Error(
        "Punkty referencyjne są współliniowe lub ułożone w sposób uniemożliwiający dopasowanie. Spróbuj rozmieścić punkty bardziej przestrzennie na planie."
      );
    }

    const Minv00 = (M11 * M22 - M12 * M21) / det;
    const Minv01 = -(M01 * M22 - M02 * M21) / det;
    const Minv02 = (M01 * M12 - M02 * M11) / det;

    const Minv10 = -(M10 * M22 - M12 * M20) / det;
    const Minv11 = (M00 * M22 - M02 * M20) / det;
    const Minv12 = -(M00 * M12 - M02 * M10) / det;

    const Minv20 = (M10 * M21 - M11 * M20) / det;
    const Minv21 = -(M00 * M21 - M01 * M20) / det;
    const Minv22 = (M00 * M11 - M01 * M10) / det;

    const m00 = Minv00 * Yx0 + Minv01 * Yx1 + Minv02 * Yx2;
    const m01 = Minv10 * Yx0 + Minv11 * Yx1 + Minv12 * Yx2;
    const tx  = Minv20 * Yx0 + Minv21 * Yx1 + Minv22 * Yx2;

    const m10 = Minv00 * Yy0 + Minv01 * Yy1 + Minv02 * Yy2;
    const m11 = Minv10 * Yy0 + Minv11 * Yy1 + Minv12 * Yy2;
    const ty  = Minv20 * Yy0 + Minv21 * Yy1 + Minv22 * Yy2;

    return {
      type: "affine",
      matrix: [
        [m00, m01, tx],
        [m10, m11, ty],
      ],
    };
  }
}

export function invertMatrix(matrix: number[][]): number[][] {
  const m00 = matrix[0][0];
  const m01 = matrix[0][1];
  const tx = matrix[0][2];
  const m10 = matrix[1][0];
  const m11 = matrix[1][1];
  const ty = matrix[1][2];

  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-9) {
    throw new Error("Matrix is not invertible (degenerate transformation)");
  }

  const inv_m00 = m11 / det;
  const inv_m01 = -m01 / det;
  const inv_m10 = -m10 / det;
  const inv_m11 = m00 / det;

  const inv_tx = - (inv_m00 * tx + inv_m01 * ty);
  const inv_ty = - (inv_m10 * tx + inv_m11 * ty);

  return [
    [inv_m00, inv_m01, inv_tx],
    [inv_m10, inv_m11, inv_ty]
  ];
}

export async function takePlanCoordinateSnapshot(planId: string, supabase: SupabaseClient): Promise<any> {
  const snapshot: Record<string, any[]> = {};
  
  // 1. Tasks
  const { data: tasks } = await supabase.from('tasks').select('id, x_norm, y_norm').eq('plan_id', planId).not('x_norm', 'is', null);
  snapshot.tasks = tasks || [];

  // 2. BMA Devices
  const { data: bmas } = await supabase.from('bma_devices').select('id, x, y').eq('plan_id', planId).not('x', 'is', null);
  snapshot.bma_devices = bmas || [];

  // 3. Cable Bus Nodes
  const { data: nodes } = await supabase.from('cable_bus_nodes').select('id, x, y').eq('plan_id', planId).not('x', 'is', null);
  snapshot.cable_bus_nodes = nodes || [];

  // 4. Chargers
  const { data: chargers } = await supabase.from('chargers').select('id, x_norm, y_norm').eq('plan_id', planId).not('x_norm', 'is', null);
  snapshot.chargers = chargers || [];

  // 5. Fehler
  const { data: fehler } = await supabase.from('fehler').select('id, x_norm, y_norm').eq('plan_id', planId).not('x_norm', 'is', null);
  snapshot.fehler = fehler || [];

  // 6. Revisions
  const { data: revisions } = await supabase.from('revisions').select('id, x_norm, y_norm').eq('plan_id', planId).not('x_norm', 'is', null);
  snapshot.revisions = revisions || [];

  // 7. Aufmass Sessions
  const { data: aufmass } = await supabase.from('aufmass_sessions').select('id, x_norm, y_norm').eq('plan_id', planId).not('x_norm', 'is', null);
  snapshot.aufmass_sessions = aufmass || [];

  // 8. Stromkreise
  const { data: stromkreise } = await supabase.from('stromkreise').select('id, x_norm, y_norm').eq('plan_id', planId).not('x_norm', 'is', null);
  snapshot.stromkreise = stromkreise || [];

  return snapshot;
}

export async function restorePlanCoordinateSnapshot(
  planId: string,
  snapshot: any,
  transformMatrix: number[][] | null,
  supabase: SupabaseClient
): Promise<void> {
  const m = transformMatrix; // [ [m00, m01, tx], [m10, m11, ty] ]
  const m00 = m ? m[0][0] : null;
  const m01 = m ? m[0][1] : null;
  const tx  = m ? m[0][2] : null;
  const m10 = m ? m[1][0] : null;
  const m11 = m ? m[1][1] : null;
  const ty  = m ? m[1][2] : null;

  const { error } = await supabase.rpc('restore_plan_coordinate_snapshot', {
    p_plan_id: planId,
    p_snapshot: snapshot ?? {},
    p_m00: m00,
    p_m01: m01,
    p_tx: tx,
    p_m10: m10,
    p_m11: m11,
    p_ty: ty
  });

  if (error) {
    console.error("[restorePlanCoordinateSnapshot] RPC failed:", error);
    throw new Error(error.message);
  }
}

