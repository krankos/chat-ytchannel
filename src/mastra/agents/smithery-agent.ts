import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { Memory } from "@mastra/memory";

const mcp = new MCPClient({
  servers: {
    // sequentialThinking: {
    //   command: "npx",
    //   args: [
    //     "-y",
    //     "@smithery/cli@latest",
    //     "run",
    //     "@smithery-ai/server-sequential-thinking",
    //     "--key",
    //     `${process.env.SMITHERY_API_KEY || ""}`,
    //     "--profile",
    //     `${process.env.SMITHERY_PROFILE || ""}`,
    //   ],
    // },
    // supadata: {
    //   url: new URL(
    //     `https://server.smithery.ai/@supadata-ai/mcp/mcp?api_key=${process.env.SMITHERY_API_KEY || ""}&profile=${process.env.SMITHERY_PROFILE || ""}`
    //   ),
    // },
    // seqMcp: {
    //   url: new URL(
    //     `https://server.smithery.ai/@smithery-ai/server-sequential-thinking/mcp?api_key=${process.env.SMITHERY_API_KEY || ""}&profile=${process.env.SMITHERY_PROFILE || ""}`
    //   ),
    // },
    // myYtMcp: {
    //   url: new URL(
    //     `https://server.smithery.ai/@xianxx17/my-youtube-mcp-server/mcp?api_key=${process.env.SMITHERY_API_KEY || ""}&profile=${process.env.SMITHERY_PROFILE || ""}`
    //   ),
    // },
    // youtubeMcp: {
    //   url: new URL(
    //     `https://server.smithery.ai/@icraft2170/youtube-data-mcp-server/mcp?api_key=${process.env.SMITHERY_API_KEY || ""}&profile=${process.env.SMITHERY_PROFILE || ""}`
    //   ),
    //   requestInit: {
    //     headers: {
    //       Authorization: `Bearer ${process.env.SMITHERY_API_KEY || ""}`,
    //     },
    //   },
    // },
    // ytMCP: {
    //   command: "npx",
    //   args: [
    //     "-y",
    //     "@smithery/cli@latest",
    //     "run",
    //     "@xianxx17/my-youtube-mcp-server",
    //     "--key",
    //     `${process.env.SMITHERY_API_KEY || ""}`,
    //     "--profile",
    //     `${process.env.SMITHERY_PROFILE || ""}`,
    //   ],
    // },
  },
});

export const agent = new Agent({
  name: "Smithery.ai Test Agent",
  instructions: `
      You are a helpful assistant that tests tool calls
`,
  model: openai("gpt-4o"),

  // connects to MCP client and gets tools
  tools: await mcp.getTools(),

  // add memory so the agent can maintain a coherent conversation
  memory: new Memory({
    options: {
      lastMessages: 10,
    },
  }),
});
