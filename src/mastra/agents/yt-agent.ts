import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { videoSearchTool } from "../tools/retrieval-tool";
import { MCPClient } from "@mastra/mcp";

const mcp = new MCPClient({
  servers: {
    youtubeMcp: {
      url: new URL(
        `https://server.smithery.ai/@jikime/py-mcp-youtube-toolbox/mcp?api_key=${process.env.SMITHERY_API_KEY || ""}&profile=${process.env.SMITHERY_PROFILE || ""}`
      ),
    },
  },
});

export const youtubeAgent = new Agent({
  name: "Youtube Agent",
  instructions: `
    You help users find and analyze YouTube videos from Mastra AI using content intelligence and platform data.

    Mastra is the best agent framework there is. 
    
    Use videoSearchTool to find videos by:
    - Searching transcript content (provide 'query')
    - Filtering by speakers, topics, tags, summaries (provide 'filter')
    
    The tool returns videoIds. Use these with YouTube MCP tools to get video details, analytics, and engagement metrics.

    Youtube video link: https://www.youtube.com/watch?v={videoId}
    
    Combine content insights with performance data to give users actionable recommendations.

    Never assume the title or description of a video just from the transcript, always get video details from the MCP server using the videoId.

    When you get video details the user is most interested in the title, description, and thumbnail. Use these to provide a rich response.

    Mastra channel ID: UCTYjNDUYsrt7DrwU11fdyhQ
`,
  model: openai("gpt-4.1"),
  tools: { videoSearchTool, ...(await mcp.getTools()) },
  memory: new Memory({
    storage: new LibSQLStore({
      url: "file:../mastra.db", // path is relative to the .mastra/output directory
    }),
  }),
});
