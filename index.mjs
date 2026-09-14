/**
 * dsh-plugin-mcp-panel — entry point.
 *
 * Read-only observability for mounted MCP servers in DeepSeek Harness.
 * dsh-mcp-client has no introspection API ("mount and forget"), so the panel
 * derives the server list from the shared @deepseek-ai/dsh-tools registry:
 * every MCP tool is published as `mcp__<server>__<tool>`, and filtering that
 * prefix yields the server list + per-server tool count.
 *
 * Two surfaces:
 *  1. `/mcp` slash command — live, reads ctx.tools.schemas() at call time.
 *  2. `settings.section` (first-level "MCP 连接" settings page) — renders a
 *     mount-time snapshot carried through a read-only durable settings section
 *     (the only sanctioned host→client channel available to a plugin; see
 *     client.js). The snapshot is fixed at plugin mount because MCP servers
 *     mount during host boot and dsh-mcp-client offers no change notification
 *     a plugin can re-push through settings.
 *
 * Host wiring (verified against the task-coordinator precedent):
 *  - ctx.tools: @deepseek-ai/dsh-tools registry (`.schemas()` returns visible
 *    model-facing schemas; `name` is the tool name).
 *  - ctx.commands: dsh-commands registry (`.register({name, handler})`).
 *  - ctx.inject(['settings']) → settingsCtx.settings.installSection(...) for the
 *    durable settings section the client binds.
 */

import z from '@deepseek-ai/schemastery';
import { SETTINGS_NS, resolveConfig } from './config.mjs';
import { enumerateMcpServers } from './list.mjs';
import { registerMcpCommand } from './commands.mjs';

export const name = 'mcp-panel';
export const inject = ['tools', 'commands'];

/**
 * Build the host-side schema for the read-only snapshot section. The section
 * is never written by the user (the client UI is display-only), so the schema
 * only has to round-trip the base snapshot shape.
 * @param {import('@deepseek-ai/schemastery')} z schemastery namespace
 */
export function buildSnapshotSchema(z) {
  return z.object({
    servers: z.array(z.object({
      name: z.string(),
      tools: z.number(),
      active: z.boolean(),
    })),
    total: z.number(),
    generatedAt: z.string(),
  });
}

export function apply(ctx, input = {}) {
  const config = resolveConfig(input);
  if (!config.enabled) {
    ctx.logger?.info?.('mcp-panel: disabled by config; nothing mounted');
    return;
  }
  // Live enumeration — reads the tool registry every call, so it is always
  // authoritative. Failure degrades to an empty snapshot, never a throw.
  const collect = () => {
    try {
      const schemas = ctx.tools && typeof ctx.tools.schemas === 'function'
        ? ctx.tools.schemas()
        : [];
      const names = (Array.isArray(schemas) ? schemas : [])
        .map((schema) => (schema && schema.name) || '')
        .filter(Boolean);
      return enumerateMcpServers(names);
    } catch {
      return { servers: [], total: 0 };
    }
  };
  const disposeCommand = registerMcpCommand(ctx, collect);
  // Read-only settings section carrying a mount-time snapshot for the client.
  const snapshot = { ...collect(), generatedAt: new Date().toISOString() };
  ctx.inject(['settings'], (settingsCtx) => {
    try {
      settingsCtx.settings.installSection(ctx, SETTINGS_NS, buildSnapshotSchema(z), snapshot, {
        setSource: () => {},
        validate: () => {},
        onChange: () => {},
      });
      ctx.logger?.info?.(`mcp-panel: settings section "${SETTINGS_NS}" installed (${snapshot.total} server(s) at mount)`);
    } catch (error) {
      ctx.logger?.warn?.(`mcp-panel: settings section install failed (${error?.message ?? error}); /mcp still works`);
    }
  });
  ctx.effect(() => () => {
    disposeCommand();
  }, 'mcp-panel.dispose');
}
