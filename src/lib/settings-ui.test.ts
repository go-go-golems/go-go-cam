import { describe, expect, it } from "vitest";
import { SETTING_METADATA, SETTINGS_CONTROL_IDS, WORKSPACES } from "./settings-ui";

describe("settings UI metadata", () => {
  it("describes every persisted control exactly once", () => {
    expect(Object.keys(SETTING_METADATA).sort()).toEqual([...SETTINGS_CONTROL_IDS].sort());
    for (const id of SETTINGS_CONTROL_IDS) {
      const meta = SETTING_METADATA[id];
      expect(meta.purpose.length).toBeGreaterThan(10);
      expect(meta.affects.length).toBeGreaterThan(15);
    }
  });

  it("has a discoverable workspace for every metadata entry", () => {
    const ids = new Set(WORKSPACES.map((workspace) => workspace.id));
    for (const meta of Object.values(SETTING_METADATA)) expect(ids.has(meta.workspace)).toBe(true);
  });
});
