/**
 * Pure MCP-server enumeration for dsh-plugin-mcp-panel.
 *
 * dsh-mcp-client publishes every mounted server's tools into the shared
 * @deepseek-ai/dsh-tools registry under the fixed name `mcp__<server>__<tool>`
 * (see dsh-mcp-client's publicToolName contract). It exposes NO introspection
 * API, so this registry-name projection is the only observable surface.
 *
 * Consequence (documented, not a bug): a server that failed to start and was
 * "contained" (0 tools) is invisible here — the projection can only see servers
 * with >= 1 registered tool. `active` is therefore always true for every row
 * produced from the live registry; it is kept as a field for forward
 * compatibility with a future introspection-capable dsh-mcp-client.
 */

/**
 * @typedef {{ name: string, tools: number, active: boolean }} McpServerRow
 * @typedef {{ servers: McpServerRow[], total: number }} McpSnapshot
 */

/**
 * Project an array of model-visible tool names onto MCP servers.
 * @param {unknown[]} toolNames raw tool-name list (typically ctx.tools.schemas().map(s => s.name))
 * @returns {McpSnapshot}
 */
export function enumerateMcpServers(toolNames) {
  const byServer = new Map();
  for (const raw of Array.isArray(toolNames) ? toolNames : []) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const parts = raw.split('__');
    // mcp__<server>__<tool>: need at least three segments, the first `mcp`.
    if (parts.length < 3 || parts[0] !== 'mcp') continue;
    const server = parts[1];
    const tool = parts.slice(2).join('__');
    if (server.length === 0 || tool.length === 0) continue;
    let set = byServer.get(server);
    if (!set) {
      set = new Set();
      byServer.set(server, set);
    }
    set.add(tool);
  }
  const servers = [...byServer.entries()]
    .map(([name, tools]) => ({ name, tools: tools.size, active: tools.size > 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { servers, total: servers.length };
}
