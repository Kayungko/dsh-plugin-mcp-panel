/**
 * dsh-plugin-mcp-panel — client module (0.1.0)
 *
 * One surface: a first-level `settings.section` ("MCP 连接") reading the
 * ephemeral snapshot through the host's read-only mcpPanel.snapshot RPC.
 * Polls are serialized and disposed with the view; no Profile writes.
 *
 * Read-only by construction: the page renders the snapshot and offers no
 * writes. The `/mcp` slash command (host-side) remains the authoritative live
 * view; this page is a snapshot captured at plugin mount (MCP servers mount
 * during host boot, so the snapshot equals the live set in the common case).
 */

window.__ModuleLoader__.load({
	id: "dsh-plugin-mcp-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");

		const NS = "mcp-panel";
		const NS_SETTINGS = "mcp-panel";
		const STYLE_ID = "mcp-panel-settings";

		const CSS = [
			".mcpPanel{display:flex;flex-direction:column;gap:12px;max-width:640px}",
			".mcpPanelTitle{margin:0;font-size:18px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}",
			".mcpPanelIntro{margin:0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary,#5b616e)}",
			".mcpPanelSummary{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}",
			".mcpPanelEmpty{margin:0;font-size:13px;color:var(--dsw-alias-label-secondary,#5b616e)}",
			".mcpPanelList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}",
			".mcpPanelRow{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--dsw-alias-border,#e3e6eb);border-radius:8px;font-size:13px}",
			".mcpPanelDot{flex:0 0 auto;font-size:11px;line-height:1}",
			".mcpPanelDotActive{color:#22c55e}",
			".mcpPanelName{font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}",
			".mcpPanelTools{color:var(--dsw-alias-label-secondary,#5b616e)}",
			".mcpPanelHint{margin:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary,#5b616e)}",
			".mcpPanelError{margin:0;font-size:13px;color:#dc2626}"
		].join("\n");

		function installStyles() {
			if (document.querySelector(`style[data-plugin="${STYLE_ID}"]`) !== null) return () => {};
			const style = document.createElement("style");
			style.dataset.plugin = STYLE_ID;
			style.textContent = CSS;
			document.head.append(style);
			return () => { style.remove(); };
		}

		let hostCtx = null;
        const getRemote = () => {
            try {
                // Third-party namespaces are not in the core's generated Remote face.
                const rpc = hostCtx?.get?.('connection')?.rpc;
                return typeof rpc?.call === 'function'
                    ? { snapshot: () => rpc.call('/api', 'mcpPanel/snapshot', { args: {} }) }
                    : null;
            } catch { return null; }
        };

		function McpPanelTab() {
            const face = getRemote();
            const [snap, setSnap] = react.useState(null);
            react.useEffect(() => {
                let cancelled = false;
                let timer;
                const read = async () => {
                    try {
                        const current = getRemote();
                        if (!current) throw new Error('MCP 清单服务暂不可用');
                        const result = await current.snapshot();
                        if (result?.ok === false) throw new Error(result.error?.message || '读取失败');
                        if (!cancelled) setSnap({ value: result && 'value' in result ? result.value : result });
                    } catch (error) {
                        if (!cancelled) setSnap({ error: String(error?.message || error) });
                    }
                    if (!cancelled) timer = setTimeout(read, 2500);
                };
                void read();
                return () => { cancelled = true; clearTimeout(timer); };
            }, []);

			const h = react.createElement;
			if (!face && !snap) {
				return h("div", { className: "mcpPanel" },
					h("p", { className: "mcpPanelError" }, "MCP 清单服务正在连接；可在聊天中运行 /mcp 查看实时清单。"));
			}
			if (snap && snap.error) {
				return h("div", { className: "mcpPanel" },
					h("p", { className: "mcpPanelError" }, `读取失败：${snap.error}`));
			}
			const value = snap && typeof snap === "object" && "value" in snap ? snap.value : undefined;
			if (!value) {
				return h("div", { className: "mcpPanel" },
					h("p", { className: "mcpPanelIntro" }, "正在读取 MCP 挂载清单…"));
			}
			const servers = Array.isArray(value.servers) ? value.servers : [];
			const total = typeof value.total === "number" ? value.total : servers.length;
			const generatedAt = typeof value.generatedAt === "string" ? value.generatedAt : "";
			return h("div", { className: "mcpPanel" },
				h("h1", { className: "mcpPanelTitle" }, "MCP 连接"),
				h("p", { className: "mcpPanelIntro" }, "当前 DSH 已挂载的 MCP server 清单（只读快照；实时查询请在聊天中运行 /mcp）。"),
				h("p", { className: "mcpPanelSummary" }, `已连接 ${total} 个 MCP server`),
				servers.length === 0
					? h("p", { className: "mcpPanelEmpty" }, "尚未挂载任何 MCP server（若刚启动，可能仍在扫描中，数秒后自动更新；实时查询请在聊天中运行 /mcp）。")
					: h("ul", { className: "mcpPanelList" },
						servers.map((server) => h("li", { key: server.name, className: "mcpPanelRow" },
							h("span", { className: "mcpPanelDot mcpPanelDotActive" }, "●"),
							h("span", { className: "mcpPanelName" }, server.name),
							h("span", { className: "mcpPanelTools" }, `${server.tools} tool${server.tools === 1 ? "" : "s"}`)))),
				generatedAt ? h("p", { className: "mcpPanelHint" }, `快照时间：${generatedAt}`) : null);
		}

		const inject = ["slots"];
		function apply(ctx) {
			hostCtx = ctx;
			// First-level settings section (Settings → MCP 连接, order 26 — after
			// task-coordinator's 25; native seats are general=0 / models=10 /
			// plugins=15 / agent-presets=20).
			ctx.slots.inject("settings.section", () => {
				installStyles();
				return ctx.slots.register({
					name: "settings.section",
					id: "mcp-panel",
					order: 26,
					locale: NS,
					label: () => "MCP 连接"
				}, McpPanelTab);
			});
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
