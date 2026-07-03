import type { DetectionDraft, Severity } from "@/lib/detect";

// Machine à états des détections — fonction PURE.
// Compare l'existant ouvert (clé = type, une ouverte par type par compte)
// aux détections recalculées, et décide : nouveau / persistant / en amélioration / résolu.

export type ExistingDetection = {
  id: string;
  type: string;
  severity: Severity;
  state: string;
  opened_at: string;
};

const SEV_ORDER: Record<Severity, number> = { green: 0, amber: 1, red: 2 };

export type ReconcilePlan = {
  toInsert: DetectionDraft[]; // état "new"
  toUpdate: {
    id: string;
    state: "persistent" | "improving";
    severity: Severity;
    title: string;
    body: string;
  }[];
  toResolveIds: string[];
};

export function reconcileDetections(
  existing: ExistingDetection[],
  drafts: DetectionDraft[]
): ReconcilePlan {
  const plan: ReconcilePlan = { toInsert: [], toUpdate: [], toResolveIds: [] };
  const existingByType = new Map(existing.map((e) => [e.type, e]));
  const draftTypes = new Set<string>(drafts.map((d) => d.type));

  for (const draft of drafts) {
    const prev = existingByType.get(draft.type);
    if (!prev) {
      plan.toInsert.push(draft); // jamais vu → nouveau
      continue;
    }
    // Toujours présent → persistant, ou "en amélioration" si la gravité a baissé.
    const improving = SEV_ORDER[draft.severity] < SEV_ORDER[prev.severity];
    plan.toUpdate.push({
      id: prev.id,
      state: improving ? "improving" : "persistent",
      severity: draft.severity,
      title: draft.title,
      body: draft.body,
    });
  }

  // Ouverte précédemment mais plus recalculée → résolue.
  for (const e of existing) {
    if (!draftTypes.has(e.type)) plan.toResolveIds.push(e.id);
  }

  return plan;
}
