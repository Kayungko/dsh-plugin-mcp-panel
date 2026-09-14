/**
 * Slash-command surface for dsh-plugin-mcp-panel.
 *
 * Registers `/mcp` through the host's dsh-commands registry (same pattern as
 * the official dsh-command-* bundles and dsh-plugin-task-coordinator's /tasks).
 * The command executes DIRECTLY — no model turn, no tokens — which makes it the
 * right surface for a deterministic read-only observability query. It reads the
 * live tool registry at call time, so it is always authoritative (unlike the
 * settings-section snapshot, which is fixed at plugin mount).
 */

export const MCP_USAGE = 'Usage: /mcp';

/**
 * Render an {@link import('./list.mjs').McpSnapshot} as command text.
 * @param {{ servers: Array<{name: string, tools: number, active: boolean}>, total: number }} snapshot
 * @returns {{ kind: 'success'|'error', text: string }}
 */
export function renderMcpList(snapshot) {
  const servers = Array.isArray(snapshot?.servers) ? snapshot.servers : [];
  const lines = [];
  if (servers.length === 0) {
    lines.push('No MCP servers are currently mounted.');
  } else {
    lines.push(`MCP servers (${servers.length}):`);
    for (const server of servers) {
      const mark = server.active ? '●' : '○';
      lines.push(`  ${mark} ${server.name}  ${server.tools} tool${server.tools === 1 ? '' : 's'}`);
    }
  }
  lines.push('');
  lines.push('Legend: ● active (>=1 tool) — direct query of the live tool registry, no model turn.');
  return { kind: 'success', text: lines.join('\n') };
}

/**
 * Register the `/mcp` command. Degrades to a no-op when the host has no
 * commands registry (never breaks the host).
 * @param {object} ctx cordis context (uses ctx.commands)
 * @param {() => import('./list.mjs').McpSnapshot} collect live enumeration callback
 * @returns {() => void} disposer
 */
export function registerMcpCommand(ctx, collect) {
  if (!ctx.commands || typeof ctx.commands.register !== 'function') {
    ctx.logger?.warn?.('mcp-panel: ctx.commands unavailable; /mcp not registered');
    return () => {};
  }
  const dispose = ctx.commands.register({
    name: 'mcp',
    description: 'List mounted MCP servers and their tool counts',
    input: { hint: 'List mounted MCP servers and their tool counts' },
    async handler() {
      try {
        return renderMcpList(collect());
      } catch (error) {
        return { kind: 'error', text: `/mcp failed: ${error?.message ?? error}` };
      }
    },
  });
  ctx.logger?.info?.('mcp-panel: registered /mcp slash command');
  return () => {
    try {
      dispose?.();
    } catch {
      /* command cleanup must never throw */
    }
  };
}
