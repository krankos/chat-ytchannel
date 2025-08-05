import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { videoSearchTool } from "../tools/retrieval-tool";

export const youtubeAgent = new Agent({
  name: "Youtube Agent",
  instructions: `
    You are a helpful assistant that provides accurate info about published youtube videos from Mastra AI.
    
    Use the videoSearchTool to help users:
    - Search for specific content (provide both query and filters)
    - Browse videos by metadata (provide only filters, no query)
    
    The tool automatically chooses between semantic search and metadata browsing based on whether a query is provided.
`,
  model: openai("gpt-4.1"),
  tools: { videoSearchTool },
  memory: new Memory({
    storage: new LibSQLStore({
      url: "file:../mastra.db", // path is relative to the .mastra/output directory
    }),
  }),
});
