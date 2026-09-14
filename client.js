/**
 * dsh-plugin-mcp-panel — client module (0.1.0)
 *
 * One surface: a first-level `settings.section` ("MCP 连接") that renders the
 * mount-time snapshot of mounted MCP servers. The snapshot travels through the
 * plugin's durable settings section (`mcp-panel`, installed host-side in
 * index.mjs) — the ONLY sanctioned host→client channel a slots-only bundle can
 * read (verified against dsh-plugin-task-coordinator 0.25.2: client injects
 * ["slots"] and sights services through ctx.get()).
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
		let boundScope = null;
		/**
		 * Bind the plugin's settings namespace once sighted. ctx.get() bypasses
		 * the runner's inject-declaration gate (slots-only bundle), matching the
		 * task-coordinator precedent. Every read is guarded: a missing service
		 * degrades to null and the page renders a diagnostics line, never a crash.
		 */
		const getBoundScope = () => {
			if (boundScope) return boundScope;
			try {
				const svc = hostCtx && (typeof hostCtx.get === "function" ? hostCtx.get("settingsScope") : hostCtx.settingsScope);
				if (typeof svc?.bind === "function") {
					const scope = svc.bind({ namespace: NS_SETTINGS });
					if (scope && typeof scope.getSnapshot === "function") boundScope = scope;
				}
			} catch { /* retry on the next render */ }
			return boundScope;
		};

		function McpPanelTab() {
			const scope = getBoundScope();
			const [snap, setSnap] = react.useState(null);
			react.useEffect(() => {
				if (!scope) return undefined;
				try {
					setSnap(scope.getSnapshot());
					return scope.subscribe(() => {
						try { setSnap(scope.getSnapshot()); } catch { /* keep the last good snapshot */ }
					});
				} catch (error) {
					setSnap({ error: String((error && error.message) || error) });
					return undefined;
				}
			}, [scope]);

			const h = react.createElement;
			if (!scope) {
				return h("div", { className: "mcpPanel" },
					h("p", { className: "mcpPanelError" }, "设置服务不可用（宿主缺少 settingsScope），无法读取 MCP 挂载清单；可在聊天中运行 /mcp 查看实时清单。"));
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
					? h("p", { className: "mcpPanelEmpty" }, "尚未挂载任何 MCP server。MCP 由插件通过 Cordis 编程式挂载，此处只做展示。")
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
