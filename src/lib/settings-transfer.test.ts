import { describe, expect, it } from "vitest";
import { settingsStorageKeyForImage } from "./settings-storage";
import {
  formatSettingsTransfer,
  parseSettingsTransfer,
  SETTINGS_TRANSFER_FORMAT,
  SETTINGS_TRANSFER_VERSION
} from "./settings-transfer";

describe("settings transfer", () => {
  it("round-trips a versioned settings payload", () => {
    const text = formatSettingsTransfer({ finishedWidth: 100, autoCrop: true, pocketStrategy: "fermat" });
    expect(parseSettingsTransfer(text)).toEqual({
      format: SETTINGS_TRANSFER_FORMAT,
      version: SETTINGS_TRANSFER_VERSION,
      settings: { finishedWidth: 100, autoCrop: true, pocketStrategy: "fermat" }
    });
  });

  it("rejects unsupported payloads and non-finite values", () => {
    expect(() => parseSettingsTransfer("not json")).toThrow("valid JSON");
    expect(() => parseSettingsTransfer('{"format":"other","version":1,"settings":{}}')).toThrow("not supported");
    expect(() => parseSettingsTransfer('{"format":"abs-bicolor-v-engraver/settings","version":1,"settings":{"x":null}}'))
      .toThrow("unsupported value");
  });
});

describe("settingsStorageKeyForImage", () => {
  it("is stable for the same image data and changes for different image data", () => {
    const first = "data:image/png;base64,AAAA";
    expect(settingsStorageKeyForImage(first)).toBe(settingsStorageKeyForImage(first));
    expect(settingsStorageKeyForImage(first)).not.toBe(settingsStorageKeyForImage("data:image/png;base64,AAAB"));
  });
});
