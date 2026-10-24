# Project rules

## Supabase MCP

- Whenever the user says "use the supabase mcp server" (or asks anything that needs the Supabase MCP), always use the project **VPR_NEW** — project id / ref `iudujncjpkhfoprtwfns` (org `vijay_industrise`, id `fclypmmqvqjecxdrawzg`). It is the same project as `VITE_SUPABASE_URL` in `.env`.
- Use the `plugin:supabase` MCP server (tools named `mcp__plugin_supabase_supabase__*`), which is connected to that account.
- Never use the `claude.ai Supabase` connector (tools named `mcp__claude_ai_Supabase__*`). It is connected to a different account ("hosproductionsurat-source's Org", project `hos-orders`), which is not this repo's database.
- Always pass `project_id: "iudujncjpkhfoprtwfns"` explicitly; never pick a project from a list by guessing.
