export interface Snapshot {
  messageId: string
  sheetXml: string
  chatIndex: number
}

// ─── Shared mutable state ───────────────────────────────────
export let activeChatId: string | null = null
export let pendingGenerationType: string = 'normal'
export const sheets: Map<string, string> = new Map()
export const snapshots: Map<string, Snapshot[]> = new Map()
export const committedMessageIds: Set<string> = new Set()

// ─── Prompt-time sheet snapshot ─────────────────────────────
// Stores the exact sheet XML that was shown to the LLM in the most
// recent promptInterceptor call for a given chat.  This decouples
// contentProcessor and commitUpdate from the race condition with
// GENERATION_ENDED: they use the pre-generation sheet (the one the
// LLM actually saw) as the "old" sheet, not the potentially-already-
// updated sheets.get(chatId).
export const promptSheets: Map<string, string> = new Map()

// ─── Pre-generation sheet snapshot (for swipe restoration) ────
// Stores the sheet state BEFORE the current turn's digestion tick.
// On "normal"/"continue"/"regenerate" we capture the sheet here.
// On "swipe" we restore from here so every swipe variant computes
// its digestion tick from the same pre-turn baseline — exactly what
// "regenerate" achieves via MESSAGE_DELETED → rollbackOnDelete.
//
// NOTE: This was previously an in-memory Map, but that is volatile —
// mobile browsers aggressively unload background extensions, which
// clears the Map and causes swipes to fall through to the post-generation
// sheet.  We now persist it via spindle.variables.chat so it survives
// reloads, extension restarts, and mobile backgrounding.
// See interceptor.ts getPreGenerationSheet/setPreGenerationSheet.

// ─── Settings (received from frontend) ──────────────────────
export let toastSettings: Record<string, boolean> = {
  digestionTicks: true, climaxEvents: true, clothingDamage: true,
  nutrientAbsorption: false, digestionSkips: false, sheetSync: true,
  rollbackEvents: true, rollbackWarnings: true, errors: true, chatWarnings: false,
  struggleEvents: true, vomitEvents: true,
  lactationEvents: true,
  healthEvents: true,
  progressionEvents: true,
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
}

// ─── Setters (writes must go through these to reassign the live bindings) ──
export function setActiveChatId(value: string | null): void { activeChatId = value }
export function setPendingGenerationType(value: string): void { pendingGenerationType = value }
export function setToastSettings(value: Record<string, boolean>): void { toastSettings = value }
export function setEngineToggles(value: Record<string, boolean>): void { engineToggles = value }
