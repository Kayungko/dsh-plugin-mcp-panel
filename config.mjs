/**
 * Configuration resolution for dsh-plugin-mcp-panel.
 * Pure module: no harness imports, fully unit-testable.
 */

/** Durable settings namespace owned by this plugin (lowercase-hyphenated, host rule). */
export const SETTINGS_NS = 'mcp-panel';

export const DEFAULTS = Object.freeze({
  /** Master switch. When false the plugin mounts nothing at all. */
  enabled: true,
});

/**
 * Merge user config over defaults, rejecting wrong types instead of guessing.
 * @param {unknown} input raw plugin config (usually an object from cordis.yml)
 * @returns {typeof DEFAULTS & Record<string, unknown>}
 */
export function resolveConfig(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const config = { ...DEFAULTS };
  if (source.enabled !== undefined) {
    if (typeof source.enabled !== 'boolean') {
      throw new TypeError('mcp-panel config "enabled" must be boolean');
    }
    config.enabled = source.enabled;
  }
  return config;
}
