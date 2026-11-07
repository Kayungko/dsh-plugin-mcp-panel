/** Read-only MCP visibility on DSH 0.2; no configuration writes. */
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { resolveConfig } from './config.mjs';
import { enumerateMcpServers } from './list.mjs';
import { registerMcpCommand } from './commands.mjs';
export const name = 'mcp-panel';
export const inject = ['tools', 'commands'];

export class McpPanelService extends TypertRemoteService {
  constructor(ctx, collect) { super(ctx, 'mcpPanel'); this.collect = collect; }
  snapshot() { return { ...this.collect(), generatedAt: new Date().toISOString() }; }
}
Object.defineProperty(McpPanelService.prototype, '@deepseek-ai/dsh-typert-protocol/remote-methods', {
  value: Object.freeze({ version: 1, methods: Object.freeze([
    Object.freeze({ method: 'snapshot', invocation: Object.freeze({ kind: 'direct' }) }),
  ]) }),
});

export function apply(ctx, input = {}) {
  if (!resolveConfig(input).enabled) return;
  const collect = () => {
    try {
      const schemas = ctx.tools.schemas();
      return enumerateMcpServers((Array.isArray(schemas) ? schemas : []).map((row) => row?.name).filter(Boolean));
    } catch { return { servers: [], total: 0 }; }
  };
  const dispose = registerMcpCommand(ctx, collect);
  ctx.inject(['typert'], (child) => { new McpPanelService(child, collect); });
  ctx.effect(() => dispose, 'mcp-panel.dispose');
}
