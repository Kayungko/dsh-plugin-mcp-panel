# dsh-plugin-mcp-panel

DSH 的 MCP 可见性面板（只读）。解决一个具体痛点：DSH 通过 Cordis 插件编程式挂载 MCP server（如 OpenViking 记忆服务），但**没有任何 UI 能看出当前挂了哪些 MCP**。本插件把它变成一眼可查的清单。

## 能做什么

- **`/mcp` slash 命令**：实时读取 `@deepseek-ai/dsh-tools` 注册表，列出当前挂载的 MCP server + 各 server 工具数。每次调用实时、权威、零 token（不经过模型）。
- **设置页「MCP 连接」一级 section**：渲染挂载时快照（server 名 + 工具数 + 活跃状态）。

## 明确不做什么

- 不增删/开关 MCP（dsh-mcp-client 无自省/卸载 API，且那是挂载方插件的职责）。
- 不写 Codex `~/.codex/config.toml`、不镜像 Codex 侧 MCP。
- 不展示、不缓存、不落盘任何启动命令/env/凭据。

## 原理与局限（务必了解）

dsh-mcp-client 是"挂载即忘"的桥，**没有枚举/自省 API**。本插件从共享的工具注册表反推：每个 MCP 工具以 `mcp__<server>__<tool>` 命名发布，过滤前缀即得 server 清单 + 工具数。

由此产生的两条边界：

1. **只见"注册了 ≥1 工具"的活跃 server**。启动失败被 contain（0 工具）的 server 不可见——`active` 字段因此对注册表枚举恒为 true（保留该字段仅为向前兼容）。
2. **设置页是挂载时快照**，不是实时。MCP server 在宿主启动时挂载，故快照通常等于实况；要实时请用 `/mcp`（宿主侧实时读）。

## 安装

1. 将本目录部署到 DSH 桌面 profile 的插件目录（同 `dsh-plugin-task-coordinator` 的安装位）。
2. 重启 DSH，或让宿主重新加载插件组。
3. 验证：聊天框输入 `/mcp` 应返回清单；设置页左侧出现「MCP 连接」。

## 目录结构

```
index.mjs      入口：注入 tools/commands/settings，挂 /mcp + 只读 settings section
list.mjs       纯枚举逻辑（mcp__<server>__<tool> → 清单），单测覆盖
commands.mjs   /mcp 命令注册与渲染
config.mjs     resolveConfig（enabled 开关）
client.js      settings.section UI（React，只读渲染快照）
cordis.patch.yml  插件组声明
test/          单测
```

## 验证

```bash
npm run check   # node --check 全部源码
npm test        # 枚举逻辑单测
```

## 许可

MIT
