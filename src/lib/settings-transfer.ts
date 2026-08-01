export const SETTINGS_TRANSFER_FORMAT = "abs-bicolor-v-engraver/settings";
export const SETTINGS_TRANSFER_VERSION = 3;

export type SettingsTransferValue = boolean | number | string;
export type SettingsTransferValues = Record<string, SettingsTransferValue>;

export interface SettingsTransfer {
  format: typeof SETTINGS_TRANSFER_FORMAT;
  version: typeof SETTINGS_TRANSFER_VERSION;
  settings: SettingsTransferValues;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTransferValue(value: unknown): value is SettingsTransferValue {
  return typeof value === "boolean" || typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value));
}

export function formatSettingsTransfer(settings: SettingsTransferValues): string {
  return JSON.stringify({
    format: SETTINGS_TRANSFER_FORMAT,
    version: SETTINGS_TRANSFER_VERSION,
    settings
  } satisfies SettingsTransfer, null, 2);
}

export function parseSettingsTransfer(text: string): SettingsTransfer {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Settings must be valid JSON copied from this application.");
  }
  if (!isPlainObject(value) || value.format !== SETTINGS_TRANSFER_FORMAT || value.version !== SETTINGS_TRANSFER_VERSION) {
    throw new Error("Settings format or version is not supported.");
  }
  if (!isPlainObject(value.settings)) throw new Error("Settings payload is missing its settings object.");

  const settings: SettingsTransferValues = {};
  for (const [key, setting] of Object.entries(value.settings)) {
    if (!isTransferValue(setting)) throw new Error(`Setting ${key} has an unsupported value.`);
    settings[key] = setting;
  }
  return { format: SETTINGS_TRANSFER_FORMAT, version: SETTINGS_TRANSFER_VERSION, settings };
}
