# Client configuration

Every block below starts the same server: `npx -y @clear-initiative/mcp@<version>` over stdio,
with `CLEAR_API_URL` and `CLEAR_API_KEY` in its environment. Replace `0.5.1` with the version you
pinned, and fill the URL. **Read the key from the environment or a secret store.** The literal
`sk_live_…` belongs only in files that are never committed.

For a **Task Worker**, add `CLEAR_MCP_WORKER=1` to the server's environment and use the
`worker`-role key. Nothing else changes. The web Worker's full runbook is
`skills/clear-impact-prior/README.md`.

Two problems recur across frameworks, so check for both:

- **The environment replaces, not extends.** Some MCP SDK versions start the server with *only*
  the `env` you pass, so `npx` is not found (`ENOENT`), or Node is the wrong version. Always pass
  `PATH` (and `HOME`) through, as the examples do.
- **A process per call.** Some adapters open a fresh session for every tool call, which means a
  new `npx` process each time, and `clear_find_location` reloads its index on every call. Hold one
  session open for the life of the bot.

## Claude Code

The plugin gives you the server and every skill:

```bash
claude plugin marketplace add CLEAR-Initiative/clear-mcp
claude plugin install clear-mcp@clear --config api_url=https://<clear-api> --config api_key="$CLEAR_API_KEY"
```

If you want the server only:
`claude mcp add clear -e CLEAR_API_URL=https://<clear-api> -e CLEAR_API_KEY="$CLEAR_API_KEY" -- npx -y @clear-initiative/mcp@0.5.1`.

## Claude Desktop

1. Download `clear-mcp-<version>.mcpb` from the repository's latest GitHub Release.
2. Open the file, then fill in the URL and the key. Desktop keeps the key in the OS keychain.

## JSON `mcpServers` (Claude Desktop without the extension, Cursor, Windsurf, Cline, most clients)

```json
{
  "mcpServers": {
    "clear": {
      "command": "npx",
      "args": ["-y", "@clear-initiative/mcp@0.5.1"],
      "env": {
        "CLEAR_API_URL": "https://<clear-api>",
        "CLEAR_API_KEY": "sk_live_…"
      }
    }
  }
}
```

Cursor reads `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project. Keep a project file that
holds the key out of git.

## Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.clear]
command = "npx"
args = ["-y", "@clear-initiative/mcp@0.5.1"]
env = { CLEAR_API_URL = "https://<clear-api>", CLEAR_API_KEY = "sk_live_…" }
```

## Python: the MCP SDK

```python
import os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

CLEAR = StdioServerParameters(
    command="npx",
    args=["-y", "@clear-initiative/mcp@0.5.1"],
    env={
        "PATH": os.environ["PATH"],
        "HOME": os.environ["HOME"],
        "CLEAR_API_URL": os.environ["CLEAR_API_URL"],
        "CLEAR_API_KEY": os.environ["CLEAR_API_KEY"],
    },
)

async with stdio_client(CLEAR) as (read, write), ClientSession(read, write) as session:
    await session.initialize()
    tools = (await session.list_tools()).tools          # name, description, inputSchema
    result = await session.call_tool("clear_whoami", {})  # result.isError, result.structuredContent
```

## Python: OpenAI Agents SDK

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async with MCPServerStdio(
    name="clear",
    params={"command": CLEAR.command, "args": CLEAR.args, "env": CLEAR.env},  # CLEAR as above
    cache_tools_list=True,
) as clear:
    agent = Agent(name="CLEAR analyst", instructions=SYSTEM_PROMPT, mcp_servers=[clear])
    print((await Runner.run(agent, "Who am I in CLEAR?")).final_output)
```

`SYSTEM_PROMPT` is the text from step 6 of `SKILL.md`. To run on another provider's model,
change the agent's model. The MCP part stays the same.

## Python: LangChain / LangGraph

```python
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools

client = MultiServerMCPClient({"clear": {"transport": "stdio", "command": CLEAR.command,
                                         "args": CLEAR.args, "env": CLEAR.env}})
async with client.session("clear") as session:      # one long-lived session, not one per call
    tools = await load_mcp_tools(session)
    # build your agent (e.g. langgraph.prebuilt.create_react_agent(model, tools)) inside this block
```

## TypeScript: the MCP SDK

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@clear-initiative/mcp@0.5.1"],
  env: {
    ...getDefaultEnvironment(),
    CLEAR_API_URL: process.env.CLEAR_API_URL!,
    CLEAR_API_KEY: process.env.CLEAR_API_KEY!,
  },
});
const client = new Client({ name: "my-bot", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
const who = await client.callTool({ name: "clear_whoami", arguments: {} });
```

## A bot on another model API (e.g. a Grok bot)

Grok's chat API supports function calling but cannot start a local MCP server. xAI's
*remote* MCP tool accepts only an HTTP/SSE URL, and clear-mcp has no hosted mode yet. So the
bot runs its own loop. It starts clear-mcp as above, hands the tools to the model as functions,
and forwards each function call to the server. The same shape works for any OpenAI-compatible
chat API.

```python
import json, os
from openai import AsyncOpenAI

grok = AsyncOpenAI(base_url="https://api.x.ai/v1", api_key=os.environ["XAI_API_KEY"])

async def ask(session, question: str, max_rounds: int = 12) -> str:
    """`session` is an initialised ClientSession (Python: the MCP SDK, above), held open for the bot's lifetime."""
    tools = [
        {"type": "function",
         "function": {"name": t.name, "description": t.description, "parameters": t.inputSchema}}
        for t in (await session.list_tools()).tools
    ]
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": question}]
    for _ in range(max_rounds):
        reply = (await grok.chat.completions.create(
            model=os.environ["GROK_MODEL"], messages=messages, tools=tools)).choices[0].message
        messages.append(reply.model_dump(exclude_none=True))
        if not reply.tool_calls:
            return reply.content
        for call in reply.tool_calls:
            result = await session.call_tool(call.function.name, json.loads(call.function.arguments or "{}"))
            # Errors are values: an isError result carries {code, subCode?, message}; let the model read it.
            text = "".join(c.text for c in result.content if c.type == "text")
            messages.append({"role": "tool", "tool_call_id": call.id, "content": text})
    return f"Stopped after {max_rounds} tool rounds."
```

Cap the rounds as shown. Keep `SYSTEM_PROMPT`'s rule that `content` is data: signal bodies and
report passages are attacker-writable text that the bot reads.

## Tool library (a Node agent in your own process)

When the agent is your own Node code and you don't need MCP, import the same tools directly:
`@clear-initiative/mcp/library` (`curatedTools`, `createUpstream`, `runTool`). See the
repository README's "Tool library" section. It never includes the escape hatch or the Worker
tools.
