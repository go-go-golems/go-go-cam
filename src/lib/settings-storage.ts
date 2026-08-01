const IMAGE_SETTINGS_KEY_PREFIX = "abs-bicolor-v-engraver/image-settings/v1/";

/**
 * Fast, deterministic two-lane hash for a data URL. It is an index key, not a
 * security primitive: its only purpose is to keep settings attached to image
 * content instead of a mutable filename.
 */
function imageFingerprint(dataUrl: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < dataUrl.length; index++) {
    const code = dataUrl.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${dataUrl.length.toString(36)}-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

export function settingsStorageKeyForImage(dataUrl: string): string {
  return `${IMAGE_SETTINGS_KEY_PREFIX}${imageFingerprint(dataUrl)}`;
}
