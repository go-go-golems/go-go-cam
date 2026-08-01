import { SETTING_METADATA, SETTINGS_CONTROL_IDS, type PresetScope, type SettingControlId } from "./settings-ui";
import type { SettingsTransferValue, SettingsTransferValues } from "./settings-transfer";

export const CAM_PRESET_FORMAT = "abs-bicolor-v-engraver/cam-preset";
export const CAM_PRESET_VERSION = 1;
const STORAGE_PREFIX = "abs-bicolor-v-engraver/cam-presets/v1/";

export interface CamPreset {
  format: typeof CAM_PRESET_FORMAT;
  version: typeof CAM_PRESET_VERSION;
  scope: PresetScope;
  name: string;
  values: Partial<Record<SettingControlId, SettingsTransferValue>>;
  note?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValue(value: unknown): value is SettingsTransferValue {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

export function settingIdsForScope(scope: PresetScope): SettingControlId[] {
  return SETTINGS_CONTROL_IDS.filter((id) => SETTING_METADATA[id].scopes.includes(scope));
}

export function buildCamPreset(name: string, scope: PresetScope, all: SettingsTransferValues, note?: string): CamPreset {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Give the recipe a name.");
  const values: Partial<Record<SettingControlId, SettingsTransferValue>> = {};
  for (const id of settingIdsForScope(scope)) values[id] = all[id];
  return { format: CAM_PRESET_FORMAT, version: CAM_PRESET_VERSION, scope, name: normalizedName, values, ...(note?.trim() ? { note: note.trim() } : {}) };
}

export function formatCamPreset(preset: CamPreset): string {
  return JSON.stringify(preset, null, 2);
}

export function parseCamPreset(text: string): CamPreset {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("Recipe must be valid JSON."); }
  if (!isObject(raw) || raw.format !== CAM_PRESET_FORMAT || raw.version !== CAM_PRESET_VERSION) throw new Error("Recipe format or version is not supported.");
  if (typeof raw.name !== "string" || !raw.name.trim()) throw new Error("Recipe needs a name.");
  if (typeof raw.scope !== "string" || !["material-and-tools", "t1-clearing", "frame-cutout", "machine-safety", "image-processing"].includes(raw.scope)) throw new Error("Recipe has an unsupported scope.");
  if (!isObject(raw.values)) throw new Error("Recipe values are missing.");
  const allowed = new Set(settingIdsForScope(raw.scope as PresetScope));
  const values: Partial<Record<SettingControlId, SettingsTransferValue>> = {};
  for (const [id, value] of Object.entries(raw.values)) {
    if (!allowed.has(id as SettingControlId)) throw new Error(`Recipe field ${id} is not allowed in this scope.`);
    if (!isValue(value)) throw new Error(`Recipe field ${id} has an unsupported value.`);
    values[id as SettingControlId] = value;
  }
  if (!Object.keys(values).length) throw new Error("Recipe has no values.");
  if (raw.note !== undefined && typeof raw.note !== "string") throw new Error("Recipe note must be text.");
  return { format: CAM_PRESET_FORMAT, version: CAM_PRESET_VERSION, scope: raw.scope as PresetScope, name: raw.name.trim(), values, ...(typeof raw.note === "string" ? { note: raw.note } : {}) };
}

export function diffCamPreset(preset: CamPreset, all: SettingsTransferValues): string[] {
  return Object.entries(preset.values).filter(([id, value]) => all[id] !== value).map(([id]) => id);
}

function storageKey(name: string): string { return `${STORAGE_PREFIX}${encodeURIComponent(name)}`; }
export function saveCamPreset(storage: Storage, preset: CamPreset): void { storage.setItem(storageKey(preset.name), formatCamPreset(preset)); }
export function loadCamPresets(storage: Storage): CamPreset[] {
  const presets: CamPreset[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    try { presets.push(parseCamPreset(storage.getItem(key) ?? "")); } catch { storage.removeItem(key); }
  }
  return presets.sort((a, b) => a.name.localeCompare(b.name));
}
export function deleteCamPreset(storage: Storage, name: string): void { storage.removeItem(storageKey(name)); }
