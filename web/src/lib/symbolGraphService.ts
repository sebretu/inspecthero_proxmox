import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export interface GraphNode {
  id: string;
  type: "symbol" | "circuit" | "breaker" | "cable" | "phase";
  label: string;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: "belongs_to_circuit" | "protected_by" | "wired_with" | "spatial_neighbor";
  distance?: number;
}

export interface SymbolGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Builds a relational and spatial Knowledge Graph for all electrical markers on a plan.
 * Connects symbols to their breakers, cables, and neighboring symbols.
 */
export async function getSymbolGraph(planId: string): Promise<SymbolGraph> {
  const admin = getSupabaseAdminClient();

  // Fetch all markers for the plan (using the correct "type" column name and selecting metadata for kabeltyp)
  const { data: markers, error } = await admin
    .from("stromkreise")
    .select("id, type, circuit_code, breaker_current, breaker_curve, phase, x_norm, y_norm, metadata")
    .eq("plan_id", planId);

  if (error) throw error;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  if (!markers || markers.length === 0) {
    return { nodes, edges };
  }

  // Map to collect distinct helper nodes to avoid duplicates
  const helperNodes = new Set<string>();

  for (const m of markers) {
    // 1. Symbol Node (mapping the database "type" enum to node label)
    nodes.push({
      id: m.id,
      type: "symbol",
      label: m.type,
      x: m.x_norm,
      y: m.y_norm
    });

    // 2. Circuit Node & Link
    if (m.circuit_code) {
      const cId = `circuit_${m.circuit_code}`;
      if (!helperNodes.has(cId)) {
        nodes.push({ id: cId, type: "circuit", label: m.circuit_code });
        helperNodes.add(cId);
      }
      edges.push({
        source: m.id,
        target: cId,
        relation: "belongs_to_circuit"
      });
    }

    // 3. Breaker Node & Link
    if (m.breaker_current) {
      const curve = m.breaker_curve || "B";
      const bId = `breaker_${curve}${m.breaker_current}`;
      if (!helperNodes.has(bId)) {
        nodes.push({ id: bId, type: "breaker", label: `${curve}${m.breaker_current}A` });
        helperNodes.add(bId);
      }
      edges.push({
        source: m.id,
        target: bId,
        relation: "protected_by"
      });
    }

    // 4. Cable Node & Link
    const metadata = (m.metadata || {}) as any;
    const kabeltyp = metadata.kabeltyp || metadata.cable;
    if (kabeltyp) {
      const cabId = `cable_${kabeltyp}`;
      if (!helperNodes.has(cabId)) {
        nodes.push({ id: cabId, type: "cable", label: kabeltyp });
        helperNodes.add(cabId);
      }
      edges.push({
        source: m.id,
        target: cabId,
        relation: "wired_with"
      });
    }
  }

  // 5. Connect spatial neighbors
  const proximityThreshold = 0.05; // ~125px on 2500px plans
  for (let i = 0; i < markers.length; i++) {
    const m1 = markers[i];
    for (let j = i + 1; j < markers.length; j++) {
      const m2 = markers[j];
      const dx = m1.x_norm - m2.x_norm;
      const dy = m1.y_norm - m2.y_norm;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < proximityThreshold) {
        edges.push({
          source: m1.id,
          target: m2.id,
          relation: "spatial_neighbor",
          distance: Number(distance.toFixed(4))
        });
      }
    }
  }

  return { nodes, edges };
}
