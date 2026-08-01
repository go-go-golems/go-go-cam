export const SETTINGS_CONTROL_IDS = [
  "finishedWidth", "autoCrop", "cropPadding", "invertMask",
  "maxDimension", "thresholdMode", "manualThreshold", "openRadius", "closeRadius", "minArea", "simplifyTolerance",
  "vAngle", "capThickness", "breakthrough", "stepover", "rasterDirection",
  "pocketStrategy", "flatClearing", "flatClearingStepdown", "flatDiameter", "flatRpm", "flatFeed", "flatPlunge",
  "cutoutEnable", "cutoutUseUniformMargin", "cutoutMargin", "cutoutMarginTop", "cutoutMarginRight", "cutoutMarginBottom", "cutoutMarginLeft", "cutoutCornerRadius", "stockThickness", "cutoutStepdown", "cutoutOvercut", "cutoutBridgeThickness", "cutoutBridgeSpan",
  "originX", "originY", "surfaceZ", "safeZ", "approachZ", "hopZ", "hopMaxTravel", "feedXY", "feedPlunge", "spindleRpm", "emitSpindle", "mirrorX", "mirrorY"
] as const;

export type SettingControlId = typeof SETTINGS_CONTROL_IDS[number];
export type WorkspaceId = "artwork" | "engraving" | "t1" | "recipes" | "machine";
export type PresetScope = "material-and-tools" | "t1-clearing" | "frame-cutout" | "machine-safety" | "image-processing";

export interface SettingMeta {
  workspace: WorkspaceId;
  advanced?: boolean;
  scopes: PresetScope[];
  purpose: string;
  affects: string;
  caution?: string;
  preview?: "vbit" | "t1-depth" | "frame" | "machine-z";
}

const artwork = (purpose: string, affects: string, advanced = false): SettingMeta => ({ workspace: "artwork", scopes: ["image-processing"], purpose, affects, advanced });
const engraving = (purpose: string, affects: string, advanced = false, preview?: SettingMeta["preview"]): SettingMeta => ({ workspace: "engraving", scopes: ["material-and-tools"], purpose, affects, advanced, preview });
const t1 = (purpose: string, affects: string, advanced = false, preview?: SettingMeta["preview"]): SettingMeta => ({ workspace: "t1", scopes: ["material-and-tools", "t1-clearing"], purpose, affects, advanced, preview });
const frame = (purpose: string, affects: string, advanced = false): SettingMeta => ({ workspace: "t1", scopes: ["frame-cutout"], purpose, affects, advanced, preview: "frame" });
const machine = (purpose: string, affects: string, advanced = false): SettingMeta => ({ workspace: "machine", scopes: ["machine-safety"], purpose, affects, advanced, preview: "machine-z" });

export const SETTING_METADATA: Record<SettingControlId, SettingMeta> = {
  finishedWidth: artwork("Sets the physical width of the finished artwork.", "Scales every toolpath, flat-tool clearance test, and derived height."),
  autoCrop: artwork("Removes white border after mask cleanup before toolpath planning.", "Keeps the job compact; frame planning automatically preserves requested border."),
  cropPadding: artwork("Keeps this many processed pixels around cleaned artwork when cropping.", "Extra padding can preserve context; frame cutouts may increase it automatically.", true),
  invertMask: artwork("Swaps which tonal region becomes engraved.", "Changes the entire mask; inspect the clean-mask preview before machining."),
  maxDimension: artwork("Limits raster resolution used for processing.", "Higher resolution resolves detail but increases memory, path count, and processing time.", true),
  thresholdMode: artwork("Chooses automatic Otsu thresholding or an operator-picked tonal boundary.", "Determines which pixels enter the engraving mask."),
  manualThreshold: artwork("Sets the 0–255 tonal cutoff when Manual threshold is selected.", "Lower values engrave only darker pixels; this control is inactive in automatic mode."),
  openRadius: artwork("Removes small dark specks by eroding then restoring the mask.", "Can clean noise but may remove genuine fine detail.", true),
  closeRadius: artwork("Fills small white gaps by expanding then restoring the mask.", "Can join broken artwork but may close intentional openings.", true),
  minArea: artwork("Drops cleaned dark islands smaller than this processed-pixel area.", "Prevents tiny isolated toolpaths; image scale affects the physical result.", true),
  simplifyTolerance: artwork("Allows vector loops to omit tiny bends after tracing.", "Larger tolerance shortens G-code but can visibly alter boundaries.", true),
  vAngle: engraving("The included angle of the V-bit used for T2 engraving.", "Together with target depth, determines groove width.", false, "vbit"),
  capThickness: engraving("Measured thickness of the top material layer.", "Forms the base of target depth; measure stock rather than trusting nominal material.", false, "vbit"),
  breakthrough: engraving("Extra depth intentionally cut through the top layer.", "Target depth equals cap thickness plus this margin; too much can damage the lower layer.", false, "vbit"),
  stepover: engraving("Lateral overlap between adjacent pocket lanes as a percentage of cut width.", "Smaller values improve overlap and increase run time.", true),
  rasterDirection: engraving("Primary direction for raster pocket lanes.", "Changes travel pattern and visible machining direction, not target depth.", true),
  pocketStrategy: engraving("Chooses raster, contour-parallel, or continuous Fermat routing for broad T2 regions.", "Changes path ordering and travel behavior; inspect the generated preview."),
  flatClearing: t1("Enables T1 clearing only where the flat cutter fully fits before T2 finishes the rest.", "Reduces V-bit bulk removal; narrow details remain for T2."),
  flatClearingStepdown: t1("Maximum additional T1 Z depth per clearing pass.", "Repeats the same clearing routes down to unchanged target depth; smaller values reduce per-pass load.", false, "t1-depth"),
  flatDiameter: t1("Diameter of the T1 flat end mill.", "Defines which regions are wide enough to clear and the cutter-center boundary."),
  flatRpm: t1("T1 spindle speed emitted for flat clearing and frame cutting.", "Must suit the real tool and material; browser validation cannot verify spindle load.", true),
  flatFeed: t1("T1 XY cutting feed.", "Controls flat-tool cutting load and cycle time; validate on test material.", true),
  flatPlunge: t1("T1 vertical plunge feed.", "Controls entry load at each route; validate with the actual cutter.", true),
  cutoutEnable: frame("Adds the final rounded T1 frame cutout after engraving.", "Creates a through-cut ladder with four holding bridges."),
  cutoutUseUniformMargin: frame("Uses one finished artwork-to-frame clearance on every side.", "Disabling it enables independent machine-space top, right, bottom, and left margins."),
  cutoutMargin: frame("Finished artwork-to-frame clearance in uniform mode.", "The cutter center is automatically offset one flat-tool radius farther out."),
  cutoutMarginTop: frame("Finished clearance above the artwork in machine-space top direction.", "Only applies in individual-margin mode."),
  cutoutMarginRight: frame("Finished clearance on the artwork’s machine-space right side.", "Only applies in individual-margin mode."),
  cutoutMarginBottom: frame("Finished clearance below the artwork in machine-space bottom direction.", "Only applies in individual-margin mode."),
  cutoutMarginLeft: frame("Finished clearance on the artwork’s machine-space left side.", "Only applies in individual-margin mode."),
  cutoutCornerRadius: frame("Radius of the flat-tool-center frame corners; zero makes sharp corners.", "Larger radii shorten bridge-bearing straight sides and may be rejected."),
  stockThickness: frame("Measured total stock thickness for final cut-through planning.", "Together with overcut determines final frame depth; do not substitute nominal thickness."),
  cutoutStepdown: frame("Maximum Z increment for the final frame through-cut.", "Independent from T1 wide-area-clearing depth per pass."),
  cutoutOvercut: frame("Extra depth below measured stock bottom for the frame cut.", "Helps separation but intentionally enters spoilboard or sacrificial backing."),
  cutoutBridgeThickness: frame("Material intentionally left at each of four bridge midpoints.", "More retained thickness improves holding but requires more manual break-off."),
  cutoutBridgeSpan: frame("Total two-ramp bridge length on the deepest frame pass.", "Must fit within each remaining straight side after rounded corners."),
  originX: machine("Machine X offset applied to artwork coordinates.", "Moves the entire job; verify work offset before cutting."),
  originY: machine("Machine Y offset applied to artwork coordinates.", "Moves the entire job; verify work offset before cutting."),
  surfaceZ: machine("Machine Z coordinate of the measured material surface.", "All cut depths and safety heights are relative to this value."),
  safeZ: machine("Full clearance height above material surface for long travel and operation boundaries.", "Must clear clamps and workholding; this is not collision validation."),
  approachZ: machine("Rapid descent height above surface before a feed plunge.", "Capped at clearance Z; lower values reduce air time but need safe workholding."),
  hopZ: machine("Retract height used for short repositions at depth.", "Capped at clearance Z; must still clear material and local features."),
  hopMaxTravel: machine("Maximum XY travel that may use hop height instead of full clearance.", "Larger values reduce retract time but can be unsafe around clamps.", true),
  feedXY: machine("T2 V-bit XY cutting feed.", "Controls engraving load and cycle time; validate using real material.", true),
  feedPlunge: machine("T2 V-bit vertical plunge feed.", "Controls entry load for engraving routes; validate using real material.", true),
  spindleRpm: machine("T2 V-bit spindle speed emitted in G-code.", "Must match the installed tool/material and sender behavior.", true),
  emitSpindle: machine("Emits M3/M5 spindle commands in generated G-code.", "Disable only when an external workflow owns spindle control.", true),
  mirrorX: machine("Mirrors all toolpaths across the artwork X direction.", "Changes orientation and frame margins in machine coordinates; inspect preview.", true),
  mirrorY: machine("Mirrors all toolpaths across the artwork Y direction.", "Changes orientation and frame margins in machine coordinates; inspect preview.", true)
};

export const WORKSPACES: { id: WorkspaceId; label: string; description: string }[] = [
  { id: "artwork", label: "Artwork", description: "Image cleanup and finished outcome" },
  { id: "engraving", label: "T2 engraving", description: "V-bit geometry and pocketing" },
  { id: "t1", label: "T1 & frame", description: "Flat clearing, stock, and holding bridges" },
  { id: "recipes", label: "Recipes", description: "Per-image settings and reusable CAM parts" },
  { id: "machine", label: "Machine", description: "Offsets, motion safety, and export" }
];
