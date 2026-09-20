// ─── Shared mutable state ───────────────────────────────────
export let activeChatId: string | null = null
export let pendingGenerationType: string = 'normal'
export const sheets: Map<string, string> = new Map()

// ─── Settings (received from frontend) ──────────────────────
export let toastSettings: Record<string, boolean> = {
  digestionTicks: true, climaxEvents: true, clothingDamage: true,
  nutrientAbsorption: false, digestionSkips: false, sheetSync: true,
  rollbackEvents: true, rollbackWarnings: true, errors: true, chatWarnings: false,
  struggleEvents: true, vomitEvents: true,
  lactationEvents: true,
  healthEvents: true,
  progressionEvents: true,
  questEvents: true,
}
export let engineToggles: Record<string, boolean> = {
  digestionEngine: true, clothingStress: true, nutrientAbsorption: true, arousalClimax: true,
  struggleEngine: true, buffSystem: true,
  attributeSystem: false,
  healthSystem: false,
  diceSystem: false,
  unbirthEngine: false,
  cockVoreEngine: false,
  lactationEngine: false,
  progressionSystem: false,
  questSystem: false,
  dynamicMode: false,
  xmlSanitize: true,
}

// ─── Setters (writes must go through these to reassign the live bindings) ──
export function setActiveChatId(value: string | null): void { activeChatId = value }
export function setPendingGenerationType(value: string): void { pendingGenerationType = value }
export function setToastSettings(value: Record<string, boolean>): void { toastSettings = value }
export function setEngineToggles(value: Record<string, boolean>): void { engineToggles = value }
