/**
 * dsh-plugin-mcp-panel — entry point.
 *
 * Read-only observability for mounted MCP servers in DeepSeek Harness.
 * dsh-mcp-client has no introspection API ("mount and forget"), so the panel
 * derives the server list from the shared @deepseek-ai/dsh-tools registry:
 * every MCP tool is published as `mcp__<server>__<tool>`, and filtering that
 * prefix yields the server list + per-server tool count.
 *
 * ASYNC MOUNT NOTE (the reason for refresh()): MCP tools register only AFTER
 * the stdio proxy completes its initialize/tools/list handshake — which is
 * asynchronous and races this plugin's apply(). A synchronous snapshot taken
 * here is therefore almost always empty. The panel converges by re-computing
 * on every `tools/change` (fired by the registry when the MCP tools finally
 * register) and on two delayed retries, then pushes the result through the
 * settings service's `mutate` (the only plugin→client write channel available
 * to a slots-only bundle).
 *
 * Two surfaces:
 *  1. `/mcp` slash command — live, reads ctx.tools.schemas() at call time.
 *  2. `settings.section` (first-level "MCP 连接" settings page) — renders the
 *     snapshot above; it updates reactively as refresh() mutates the section.
 *
 * Host wiring (verified against the task-coordinator precedent):
 *  - ctx.tools: @deepseek-ai/dsh-tools registry (`.schemas()` returns visible
 *    model-facing schemas; `name` is the tool name).
 *  - ctx.commands: dsh-commands registry (`.register({name, handler})`).
 *  - ctx.inject(['settings']) → settingsCtx.settings.installSection(...) /
 *    .mutate(...) for the durable settings section the client binds.
 */

import z from '@deepseek-ai/schemastery';
import { SETTINGS_NS, resolveConfig } from './config.mjs';
import { enumerateMcpServers } from './list.mjs';
import { registerMcpCommand } from './commands.mjs';

export const name = 'mcp-panel';
export const inject = ['tools', 'commands'];

const EMPTY_SNAPSHOT = Object.freeze({ servers: [], total: 0, generatedAt: '' });

/**
 * Build the host-side schema for the snapshot section. The client UI is
 * display-only, so the schema only has to round-trip the snapshot shape.
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

  // Settings-service handle + snapshot refresh. The section is installed with
  // an empty base (the async MCP tools are not yet registered); refresh() then
  // converges it to the real list as tools register.
  let settingsService = null;
  const refresh = () => {
    if (!settingsService || typeof settingsService.mutate !== 'function') return;
    const snapshot = { ...collect(), generatedAt: new Date().toISOString() };
    try {
      settingsService.mutate(SETTINGS_NS, [
        { op: 'set', path: ['servers'], value: snapshot.servers },
        { op: 'set', path: ['total'], value: snapshot.total },
        { op: 'set', path: ['generatedAt'], value: snapshot.generatedAt },
      ]);
      ctx.logger?.info?.(`mcp-panel: snapshot refreshed (${snapshot.total} server(s))`);
    } catch (error) {
      ctx.logger?.warn?.(`mcp-panel: snapshot refresh failed (${error?.message ?? error}); /mcp still works`);
    }
  };

  ctx.inject(['settings'], (settingsCtx) => {
    try {
      settingsService = settingsCtx.settings;
      settingsCtx.settings.installSection(ctx, SETTINGS_NS, buildSnapshotSchema(z), EMPTY_SNAPSHOT, {
        setSource: () => {},
        validate: () => {},
        onChange: () => {},
      });
      ctx.logger?.info?.(`mcp-panel: settings section "${SETTINGS_NS}" installed`);
    } catch (error) {
      ctx.logger?.warn?.(`mcp-panel: settings section install failed (${error?.message ?? error}); /mcp still works`);
    }
  });

  // Converge: re-compute when the registry reports a tool change (the moment
  // the async MCP tools land), plus delayed retries as a belt-and-suspenders
  // fallback in case the change event races the subscription.
  const timers = [2500, 8000].map((ms) => setTimeout(refresh, ms));
  let offToolsChange = null;
  try {
    if (typeof ctx.on === 'function') offToolsChange = ctx.on('tools/change', refresh);
  } catch {
    /* tools/change subscription is best-effort; the timers still converge */
  }

  ctx.effect(() => () => {
    disposeCommand();
    for (const timer of timers) clearTimeout(timer);
    if (offToolsChange) {
      try { offToolsChange(); } catch { /* dispose must never throw */ }
    }
  }, 'mcp-panel.dispose');
}
