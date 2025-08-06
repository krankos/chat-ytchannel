# YouTube Video Processing & RAG Template

A Mastra template that demonstrates how to build **long-running AI workflows** for video processing and integrate **rich platform data** via MCP (Model Context Protocol) servers for comprehensive video analysis.

> 🎯 **Key Learning**: This template shows how to orchestrate **complex, long-running workflows** that handle video download, transcription, AI analysis, and embedding generation - while integrating **external APIs via MCP** to enrich content with platform metadata like views, comments, and engagement data.

## Overview

This template showcases key Mastra framework features through a practical video processing example:

**🎯 What You'll Learn**: How to use **Mastra workflows** for complex multi-step operations, integrate **external APIs via MCP**, and build **conversational agents** that combine multiple data sources.

**📚 Features Demonstrated**: Workflows with state management, custom tools with hybrid search, MCP integration for external APIs, and agents with memory and tool access.

### Workflow

1. **Process Video**: Mastra workflow orchestrates: Download → Transcribe with Deepgram keywords → AI content extraction → Vector embeddings
2. **Enrich Data**: MCP integration provides platform metrics (views, likes, comments, thumbnails) alongside content intelligence
3. **Agent Chat**: Conversational interface combining processed content + live platform data for comprehensive video insights

### Key Benefits

- **� Reliable Processing**: Workflows handle long-running video processing with automatic error recovery and state persistence
- **📈 Enhanced Transcription**: Deepgram keywords feature significantly improves transcription accuracy for domain-specific content
- **🌐 Rich Platform Data**: MCP integration provides live YouTube metrics, comments, and engagement data
- **🔄 Workflow Orchestration**: Learn how Mastra workflows handle multi-step processes with automatic state management
- **📈 Enhanced API Features**: See how Deepgram keywords improve transcription accuracy for domain-specific content
- **🌐 MCP Integration**: Discover how to seamlessly integrate external APIs alongside your custom AI tools
- **🤖 Intelligent Agents**: Experience how agents combine multiple tools and maintain conversation context

## Prerequisites

- Node.js 20.9.0 or higher
- PostgreSQL with pgvector extension
- OpenAI API key (for embeddings and chat completion)
- Deepgram API key (for audio transcription)
- Smithery.ai account (for YouTube MCP access)

## Setup

Clone and install dependencies:

```bash
git clone <repository-url>
cd chat-ytchannel
pnpm install
```

Set up environment variables:

```bash
cp .env.example .env
# Edit .env and add your API keys
```

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# AI Services
OPENAI_API_KEY=your_openai_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# MCP Server Access (Smithery.ai)
SMITHERY_API_KEY=your_smithery_api_key_here
SMITHERY_PROFILE=your_profile_name_here
```

Setup database:

```bash
pnpm db:push
```

Run the development server:

```bash
pnpm dev
```

## 🏗️ Mastra Features Showcase: Workflows + MCP + Agents

This template demonstrates key Mastra framework capabilities through a practical video processing example:

### The Features You'll Learn

When building AI applications with Mastra, you'll want to understand:

- **Multi-step Workflows**: How to orchestrate complex processes with state management and error handling
- **Tool Integration**: Creating custom tools that agents can use intelligently
- **MCP Protocol**: Seamlessly integrating external APIs alongside your AI tools
- **Agent Orchestration**: Building conversational AI that combines multiple data sources

### The Mastra Approach

Instead of building isolated scripts:

1. **Mastra Workflows**: Orchestrate complex, multi-step processes with automatic state persistence
2. **MCP Integration**: Access external APIs (YouTube, social platforms) as if they were native tools
3. **Custom Tools**: Build reusable, AI-callable functions with proper schemas
4. **Intelligent Agents**: Create conversational interfaces that understand context and use tools appropriately

### Implementation Examples

```typescript
// 🎯 FEATURE: Mastra Workflows - Multi-step processing with state management
const transcriptWorkflow = createWorkflow({
  id: "transcript-workflow",
  steps: [
    checkVideoStep, // Demonstrates: Step composition
    downloadVideoStep, // Demonstrates: Error handling & retries
    getTranscriptStep, // Demonstrates: External API integration
    extractDataStep, // Demonstrates: AI-powered data extraction
    chunkAndEmbedStep, // Demonstrates: Vector embedding creation
  ],
})
  .then(/* ... */)
  .commit();
```

**🎯 FEATURE: Enhanced API Integration**:

```typescript
// Deepgram with keyword enhancement for better accuracy
const transcript = await deepgram.transcribe(audioBuffer, {
  keywords: ["AI", "machine learning", "neural networks", "RAG"],
  // Shows how to use service-specific features
});
```

**🎯 FEATURE: MCP Protocol Integration**:

```typescript
// Seamless external API access via MCP
const mcp = new MCPClient({
  servers: {
    youtubeMcp: {
      url: "https://server.smithery.ai/@jikime/py-mcp-youtube-toolbox/mcp",
      apiKey: process.env.SMITHERY_API_KEY,
    },
  },
});

// Agents automatically get access to both custom and MCP tools
const agent = new Agent({
  tools: { videoSearchTool, ...(await mcp.getTools()) },
});
```

### When to Use These Features

- **Workflows**: Any multi-step AI process that needs reliability and state management
- **Custom Tools**: When you want to give agents access to specific functionality
- **MCP Integration**: When you need to combine AI capabilities with external platform data
- **Hybrid Search**: When you want to demonstrate intelligent data filtering and retrieval
- **Agent Orchestration**: When building conversational interfaces that need context and tool access

## Usage

### Process YouTube Videos

```typescript
import { mastra } from "./src/mastra/index";

const run = await mastra.getWorkflow("transcriptWorkflow").createRunAsync();

const result = await run.start({
  inputData: {
    videoId: "dQw4w9WgXcQ",
    keywords: ["AI", "machine learning"],
  },
});

console.log(`Processed video with ${result.chunksCreated} chunks`);
```

### Using the Video Search Tool

```typescript
import { videoSearchTool } from "./src/mastra/tools/retrieval-tool";

// Browse by metadata only (fast)
const browseResults = await videoSearchTool.execute({
  context: {
    filter: { speaker: "John", tag: "AI" },
  },
});

// Hybrid search: metadata + semantic (optimal)
const searchResults = await videoSearchTool.execute({
  context: {
    query: "machine learning algorithms",
    filter: { speaker: "John" },
    topK: 5,
  },
});

console.log(searchResults.chunks); // Enriched with video metadata
```

### Using the YouTube Agent

```typescript
const agent = mastra.getAgent("youtubeAgent");

const response = await agent.stream([
  {
    role: "user",
    content:
      "Find videos about RAG architecture by specific speakers and summarize the key insights",
  },
]);

for await (const chunk of response.textStream) {
  console.log(chunk);
}
```

### Expected Output

```json
{
  "videos": [],
  "chunks": [
    {
      "content": "RAG systems combine retrieval and generation...",
      "score": 0.87,
      "videoInfo": {
        "videoId": "abc123",
        "summary": "Discussion of RAG architecture patterns",
        "speakers": ["John Doe"],
        "keyTopics": ["RAG", "vector search", "LLMs"],
        "tags": ["AI", "architecture"]
      }
    }
  ]
}
```

## Architecture

### Components

- **`transcriptWorkflow`**: End-to-end video processing pipeline
- **`youtubeAgent`**: Conversational agent with video intelligence and YouTube platform access
- **`videoSearchTool`**: Hybrid search tool implementing two-stage filtering

### Tools

- **`videoSearchTool`**: Combines metadata filtering with semantic vector search
- **YouTube MCP Tools**: Platform data (titles, descriptions, analytics) via Smithery.ai

### Database Layer

- **Drizzle ORM**: Type-safe database operations with automatic migrations
- **PostgreSQL**: Relational data storage with JSONB for flexible metadata
- **pgvector**: Vector similarity search for semantic embeddings

### Workflow Steps

1. **`checkVideoStep`**: Avoid reprocessing existing videos
2. **`downloadVideoStep`**: Extract high-quality audio from YouTube
3. **`getTranscriptStep`**: Transcribe with Deepgram (speaker detection)
4. **`extractDataStep`**: AI-powered content analysis and metadata extraction
5. **`chunkAndEmbedStep`**: Create semantic chunks with OpenAI embeddings

## Features

- ✅ **Two-Stage Filtering**: Fast metadata pre-filtering + focused semantic search
- ✅ **Hybrid Search**: Combines structured and unstructured data retrieval
- ✅ **AI Content Extraction**: Speakers, topics, summaries from transcripts
- ✅ **Conversational Interface**: Natural language video discovery and analysis
- ✅ **YouTube Integration**: Platform data via MCP (Model Context Protocol)
- ✅ **Production Ready**: Error handling, type safety, performance optimization
- ✅ **Scalable Architecture**: Handles thousands of videos efficiently

## Database Schema

```sql
-- Videos: AI-extracted insights and full transcripts
CREATE TABLE videos (
  id TEXT PRIMARY KEY,              -- YouTube video ID
  fullTranscript TEXT,              -- Complete transcript
  metadata JSONB,                   -- AI insights: summary, speakers, topics, tags
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- Chunks: Semantic search segments
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  videoId TEXT REFERENCES videos(id),
  data JSONB,                       -- Chunk content + metadata
  createdAt TIMESTAMP DEFAULT NOW()
);

-- Vector store: pgvector embeddings (managed by @mastra/pg)
```

**AI-extracted metadata structure**:

```json
{
  "summary": "Video overview and key insights",
  "keyTopics": ["topic1", "topic2"],
  "speakers": ["Speaker Name"],
  "actionItems": ["actionable insights"],
  "tags": ["AI", "RAG", "architecture"]
}
```

## Configuration

### Environment Variables

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
OPENAI_API_KEY=your_openai_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
SMITHERY_API_KEY=your_smithery_api_key_here
SMITHERY_PROFILE=your_profile_name_here
```

### Customization

Extend the metadata extraction schema:

```typescript
// In transcript-workflow.ts
const videoDataSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  technicalLevel: z.enum(["beginner", "intermediate", "advanced"]),
  keyTopics: z.array(z.string()),
  speakers: z.array(z.string()),
  // Add custom fields
});
```

Add new search filters:

```typescript
// In retrieval-tool.ts
const queryVideos = async (filters?: {
  speaker?: string;
  tag?: string;
  sentiment?: string;
  dateRange?: { start: Date; end: Date };
}) => {
  // Implement additional filtering logic
};
```

## Development

### Project Structure

```
src/mastra/
├── agents/
│   └── yt-agent.ts                 # Conversational YouTube agent
├── tools/
│   └── retrieval-tool.ts           # Hybrid search implementation
├── workflows/
│   └── transcript-workflow.ts     # Video processing pipeline
├── db/
│   └── schema.ts                   # Database schema
└── index.ts                        # Mastra configuration
```

### Testing

```bash
# Process a test video
export OPENAI_API_KEY="your-api-key"
export DEEPGRAM_API_KEY="your-deepgram-key"

curl -X POST http://localhost:4000/workflows/transcript-workflow/run \
  -H "Content-Type: application/json" \
  -d '{"videoId": "dQw4w9WgXcQ", "keywords": ["test"]}'
```

### Development Commands

```bash
pnpm dev                    # Start Mastra dev server with playground
pnpm db:push               # Update database schema
pnpm db:studio             # Open Drizzle Studio
```

## Common Issues

### "Failed to download video"

- Verify the YouTube video ID is correct and accessible
- Some videos may have download restrictions
- Check network connectivity and YouTube API limits

### "Database connection failed"

- Ensure PostgreSQL is running with pgvector extension
- Verify `DATABASE_URL` in your `.env` file
- Check database permissions and connectivity

### "No embeddings generated"

- Verify `OPENAI_API_KEY` is valid and has sufficient credits
- Check that video transcription was successful
- Ensure chunks were created during processing

### "Vector search returns no results"

- Make sure videos have been processed and indexed
- Verify the vector store table exists and has data
- Check embedding model consistency

## What Makes This Template Special

### 🎯 Comprehensive Feature Showcase

- **Workflow Orchestration**: See how Mastra handles complex multi-step processes
- **Hybrid Tool Design**: Learn to build tools that combine different data sources effectively
- **MCP Protocol Usage**: Understand how to integrate external APIs seamlessly
- **Agent Architecture**: Experience how agents coordinate multiple tools intelligently

### ⚡ Real-World Integration Patterns

- **API Enhancement**: Using service-specific features (Deepgram keywords) for better results
- **Data Composition**: Combining AI-extracted insights with live platform data
- **State Management**: Workflows that handle interruptions and resume gracefully
- **Tool Orchestration**: Agents that understand when and how to use different capabilities

### 🔧 Mastra Framework Demonstration

- **Type Safety**: Full TypeScript integration with Zod validation throughout
- **Database Integration**: Optimized queries and vector operations using Drizzle ORM
- **Modular Design**: Reusable components that showcase framework patterns
- **Best Practices**: Learn Mastra conventions and recommended approaches

### 📚 Learning Outcomes

- **Framework Mastery**: Understand core Mastra concepts through practical implementation
- **AI Integration**: See how to compose multiple AI services effectively
- **Tool Development**: Learn to build custom tools that agents can use intelligently
- **External APIs**: Master MCP protocol for seamless third-party integration

## 🚀 Broader Applications

These Mastra features can be applied to many other scenarios:

### Workflow Orchestration Examples

- **Document Processing**: Multi-step analysis of PDFs, contracts, research papers
- **Data Pipeline**: ETL processes with AI transformation and validation steps
- **Content Moderation**: Automated review workflows with human-in-the-loop steps

### Custom Tool Development

- **API Wrappers**: Create tools that wrap external services for agent use
- **Data Analyzers**: Build tools that process and summarize complex datasets
- **Integration Tools**: Connect different systems and data sources seamlessly

### MCP Integration Use Cases

- **Social Media**: Integrate Twitter, LinkedIn, Instagram APIs via MCP servers
- **Business Tools**: Connect Salesforce, HubSpot, Notion through MCP protocol
- **Development**: GitHub, Jira, CI/CD systems accessible as agent tools

### Agent Orchestration Patterns

- **Customer Support**: Agents that search knowledge bases and create tickets
- **Research Assistants**: Agents that gather information from multiple sources
- **Content Creators**: Agents that help with writing, editing, and publishing workflows

### Implementation Tips

1. **Start with Workflows**: Identify multi-step processes that benefit from state management
2. **Design Tool Schemas**: Create clear, well-documented interfaces for agent interaction
3. **Leverage MCP**: Use existing MCP servers before building custom integrations
4. **Test Agent Behavior**: Ensure agents use tools appropriately and handle errors gracefully
5. **Monitor Performance**: Track workflow success rates and agent effectiveness

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

**Built with ❤️ using [Mastra](https://mastra.ai) - The TypeScript framework for building AI applications.**

## Usage

### 1. Process a YouTube Video

Start the Mastra development server and call the transcript workflow:

```bash
# Start server
pnpm dev

# In another terminal, call the workflow
curl -X POST http://localhost:4000/workflows/transcript-workflow/run \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "dQw4w9WgXcQ",
    "keywords": ["AI", "tutorial"]
  }'
```

The workflow will:

1. Download the video audio
2. Transcribe it with speaker detection
3. Extract structured insights (summary, topics, speakers)
4. Create searchable chunks with embeddings
5. Store everything in PostgreSQL

### 2. Search and Chat

Chat with the YouTube agent using the playground at `http://localhost:4000`, or via API:

```bash
curl -X POST http://localhost:4000/agents/youtubeAgent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find videos about machine learning by specific speakers"
  }'
```

The agent combines:

- **Content intelligence** from your processed videos (via the retrieval tool)
- **Platform data** from YouTube APIs (via MCP server)
- **Conversational AI** for natural interaction

## Architecture

### Core Components

This template demonstrates three key Mastra patterns:

#### 📼 Transcript Workflow (`src/mastra/workflows/transcript-workflow.ts`)

Multi-step AI pipeline that processes YouTube videos:

```typescript
// Usage
const result = await transcriptWorkflow.run({
  videoId: "dQw4w9WgXcQ",
  keywords: ["AI", "machine learning"],
});
```

**Pipeline Steps**:

1. **Check if video exists** - Avoid reprocessing
2. **Download video audio** - High-quality audio extraction
3. **Transcribe with Deepgram** - Speech-to-text with speaker detection
4. **Extract structured data** - AI-powered content analysis
5. **Create vector embeddings** - Semantic search preparation

#### 🔍 Retrieval Tool (`src/mastra/tools/retrieval-tool.ts`)

Hybrid search system combining metadata filtering with semantic search:

```typescript
// Browse by metadata
const results = await videoSearchTool.execute({
  context: { filter: { speaker: "John", tag: "AI" } },
});

// Semantic search with filters
const results = await videoSearchTool.execute({
  context: {
    query: "machine learning algorithms",
    filter: { speaker: "John" },
    topK: 5,
  },
});
```

**Two-stage filtering approach**:

1. **Metadata filtering** (fast, precise) - Filter videos by speakers, tags, topics
2. **Semantic search** (focused, nuanced) - Vector similarity within filtered videos

#### 🤖 YouTube Agent (`src/mastra/agents/yt-agent.ts`)

Conversational AI with access to both content intelligence and platform data:

```typescript
const agent = youtubeAgent;
const response = await agent.chat("Find videos about RAG by John");
```

**Agent capabilities**:

- Search transcript content by speakers, topics, keywords
- Access YouTube metadata (titles, descriptions, thumbnails)
- Provide rich responses combining content + platform insights
- Remember conversation context via Mastra Memory

## Database Schema

```sql
-- Videos: stores transcripts and AI-extracted metadata
CREATE TABLE videos (
  id TEXT PRIMARY KEY,              -- YouTube video ID
  fullTranscript TEXT,              -- Complete transcript
  metadata JSONB,                   -- AI insights (summary, speakers, topics)
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- Chunks: transcript segments for vector search
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  videoId TEXT REFERENCES videos(id),
  data JSONB,                       -- Chunk content + metadata
  createdAt TIMESTAMP DEFAULT NOW()
);

-- Vector store: pgvector index (created by @mastra/pg)
```

**AI-extracted metadata structure**:

```json
{
  "summary": "Comprehensive video summary",
  "keyTopics": ["topic1", "topic2"],
  "speakers": ["Speaker Name"],
  "actionItems": ["actionable insights"],
  "tags": ["relevant", "keywords"]
}
```

## Learning Objectives

This template teaches core Mastra framework concepts:

### Workflow Development

- **Multi-step Orchestration** - Combining multiple operations with state management
- **Error Handling** - Building resilient processes that handle failures gracefully
- **Step Composition** - Creating reusable workflow components
- **State Persistence** - Managing long-running processes that can resume after interruption

### Tool Creation & Integration

- **Custom Tool Development** - Building tools that agents can call intelligently
- **Schema Design** - Creating clear interfaces for tool parameters and responses
- **Hybrid Data Sources** - Combining structured and unstructured data effectively
- **Tool Orchestration** - Designing tools that work well together

### MCP Protocol Usage

- **External API Integration** - Connecting third-party services via Model Context Protocol
- **Seamless Tool Access** - Making external APIs feel like native framework capabilities
- **Authentication Handling** - Managing API keys and authentication through MCP
- **Tool Discovery** - Understanding how agents discover and use MCP-provided tools

### Agent Architecture

- **Conversational AI** - Building agents that maintain context across interactions
- **Tool Selection** - Understanding how agents choose which tools to use
- **Memory Integration** - Persisting conversation state and retrieval context
- **Multi-modal Responses** - Combining different data sources in agent responses

## Customization

### Extend for Different Content Types

**Process podcasts or audio content**:

```typescript
// Modify the download step to accept audio URLs
const result = await transcriptWorkflow.run({
  audioUrl: "https://example.com/podcast.mp3",
  keywords: ["business", "strategy"],
});
```

**Add new metadata extractors**:

```typescript
// In transcript-workflow.ts, extend the schema
const videoDataSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  technicalLevel: z.enum(["beginner", "intermediate", "advanced"]),
  // ... existing fields
});
```

### Enhance Search Capabilities

**Add date range filtering**:

```typescript
// In retrieval-tool.ts
const queryVideos = async (filters?: {
  speaker?: string;
  tag?: string;
  dateRange?: { start: Date; end: Date };
}) => {
  // Add date filtering logic
};
```

**Include thumbnail search**:

```typescript
// Add image similarity search
const searchThumbnails = async (imageQuery: string) => {
  // Implement image embedding and search
};
```

### Integration Examples

**Next.js frontend**:

```typescript
// pages/api/search.ts
export default async function handler(req, res) {
  const { query, filter } = req.body;

  const results = await mastra.getTool("video-search").execute({
    context: { query, filter },
  });

  res.json(results);
}
```

**Webhook for new videos**:

```typescript
// Auto-process when new videos are uploaded
app.post("/webhook/new-video", async (req, res) => {
  const { videoId } = req.body;

  await transcriptWorkflow.run({ videoId });
  res.json({ status: "processing" });
});
```

## Development Commands

```bash
# Development
pnpm dev                    # Start Mastra dev server with playground
pnpm build                  # Build for production
pnpm start                  # Start production server

# Database
pnpm db:generate           # Generate migration files
pnpm db:migrate            # Run migrations
pnpm db:push               # Push schema changes directly
pnpm db:studio             # Open Drizzle Studio
```

## API Endpoints

When running `pnpm dev`, the following endpoints are available:

```bash
# Workflows
POST /workflows/transcript-workflow/run    # Process a YouTube video

# Agents
POST /agents/youtubeAgent/chat            # Chat with the agent
GET  /agents/youtubeAgent/threads         # List conversation threads

# Tools (used internally by agents)
POST /tools/video-search/execute          # Direct tool access
```

## Tech Stack

- **[Mastra](https://mastra.ai)** - AI application framework
- **PostgreSQL + pgvector** - Vector database for embeddings
- **Drizzle ORM** - Type-safe database operations with schema validation
- **OpenAI** - Embeddings (`text-embedding-3-small`) and chat completion (`gpt-4o`)
- **Deepgram** - High-quality audio transcription with speaker detection
- **[Smithery.ai MCP](https://smithery.ai)** - YouTube API access via Model Context Protocol
- **ytdl-core** - YouTube video download and audio extraction

## Extension Ideas

This template can be extended for:

- **Multi-channel processing** - Process entire YouTube channels automatically
- **Real-time updates** - Subscribe to new videos via webhooks
- **Advanced analytics** - Sentiment analysis, trend detection, engagement correlation
- **Multi-modal search** - Add image/thumbnail similarity search
- **Collaborative features** - Share insights, create playlists, team annotations
- **Integration platforms** - Slack bots, Discord commands, Notion databases

## Related Documentation

- [Mastra Documentation](https://docs.mastra.ai)
- [PostgreSQL pgvector](https://github.com/pgvector/pgvector)
- [Deepgram API](https://developers.deepgram.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)

---

**Built with ❤️ using [Mastra](https://mastra.ai) - The TypeScript framework for building AI applications.**

## 📊 Database Schema

```sql
-- Videos table: stores full transcripts and AI-extracted metadata
CREATE TABLE videos (
  id TEXT PRIMARY KEY,              -- YouTube video ID
  fullTranscript TEXT,              -- Complete transcript text
  metadata JSONB,                   -- AI-extracted insights
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- Chunks table: stores transcript segments for vector search
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  videoId TEXT REFERENCES videos(id),
  data JSONB,                       -- Chunk content + metadata
  createdAt TIMESTAMP DEFAULT NOW()
);

-- Vector store: pgvector index for semantic search
-- Created automatically by @mastra/pg
```

## 🔧 Core Components

### 1. Transcript Workflow

**Location**: `src/mastra/workflows/transcript-workflow.ts`

Automated pipeline that processes YouTube videos:

```typescript
// Usage example
const result = await transcriptWorkflow.run({
  videoId: "dQw4w9WgXcQ", // YouTube video ID
  keywords: ["AI", "machine learning"], // Transcription hints
});
```

**Pipeline Steps**:

1. **Check if video exists** - Avoid reprocessing
2. **Download video audio** - Extract high-quality audio using ytdl-core
3. **Transcribe with Deepgram** - Convert audio to text with speaker detection
4. **Extract structured data** - Use AI to identify speakers, topics, summaries
5. **Create vector embeddings** - Generate searchable chunks with OpenAI embeddings

**Extracted Metadata**:

```json
{
  "summary": "Comprehensive video summary",
  "keyTopics": ["topic1", "topic2"],
  "speakers": ["Speaker Name"],
  "actionItems": ["actionable insights"],
  "tags": ["relevant", "keywords"]
}
```

### 2. Retrieval Tool

**Location**: `src/mastra/tools/retrieval-tool.ts`

Hybrid search system combining metadata filtering with semantic search:

```typescript
// Usage examples

// Browse by metadata only
const results = await videoSearchTool.execute({
  context: {
    filter: { speaker: "John", tag: "AI" },
  },
});

// Semantic search with metadata filter
const results = await videoSearchTool.execute({
  context: {
    query: "machine learning algorithms",
    filter: { speaker: "John" },
    topK: 5,
  },
});
```

**Search Architecture**:

1. **Metadata Filtering** (Fast, Precise)
   - Filter videos by speakers, tags, topics
   - Uses PostgreSQL JSONB queries with indexes

2. **Semantic Search** (Focused, Nuanced)
   - Vector similarity search on transcript chunks
   - Only searches within metadata-filtered videos
   - Returns similarity scores and enriched context

**Return Format**:

```json
{
  "videos": [...],           // For browse-only queries
  "chunks": [                // For semantic search
    {
      "content": "chunk text",
      "score": 0.85,          // Similarity score
      "videoInfo": {
        "videoId": "abc123",  // For MCP server calls
        "summary": "...",
        "speakers": [...],
        "keyTopics": [...]
      }
    }
  ]
}
```

### 3. YouTube Agent

**Location**: `src/mastra/agents/yt-agent.ts`

Conversational AI agent with access to:

- **Video search tool** - Content intelligence from transcripts
- **YouTube MCP tools** - Platform data (titles, descriptions, analytics)

```typescript
// The agent combines:
// 1. Content insights (from your processed videos)
// 2. Platform data (from YouTube MCP server)
// 3. Conversational AI (GPT-4)

const agent = youtubeAgent;
const response = await agent.chat("Find videos about RAG by John");
```

**Agent Capabilities**:

- Search video content by transcript, speakers, topics
- Get YouTube metadata (titles, descriptions, thumbnails)
- Provide rich responses combining content + platform data
- Remember conversation context via Mastra Memory

## 🔄 Complete Usage Flow

### 1. Process a YouTube Video

```bash
# Start the workflow via Mastra dev server
pnpm dev

# Call the transcript workflow
POST /workflows/transcript-workflow/run
{
  "videoId": "dQw4w9WgXcQ",
  "keywords": ["AI", "tutorial"]
}
```

### 2. Search and Chat

```bash
# Chat with the agent
POST /agents/youtubeAgent/chat
{
  "message": "Find videos about machine learning by specific speakers"
}
```

The agent will:

1. Use the retrieval tool to find relevant content
2. Call YouTube MCP tools for additional metadata
3. Provide a comprehensive response with video links

## 🎓 Learning Objectives

This template teaches:

### RAG Architecture Patterns

- **Hybrid search** - Combining structured and unstructured data
- **Two-stage filtering** - Efficient relevance and performance
- **Data enrichment** - Joining vector results with relational data

### Mastra Framework Features

- **Workflows** - Multi-step AI pipelines with error handling
- **Tools** - Reusable AI-callable functions
- **Agents** - Conversational AI with tool access
- **Memory** - Persistent conversation context

### Production Considerations

- **Database design** - Optimized for both queries and vectors
- **Error handling** - Graceful degradation and logging
- **Performance** - Batch operations and efficient queries
- **Modularity** - Reusable, testable components

## 🛠️ Development Commands

```bash
# Development
pnpm dev                    # Start Mastra dev server
pnpm build                  # Build for production
pnpm start                  # Start production server

# Database
pnpm db:generate           # Generate migration files
pnpm db:migrate            # Run migrations
pnpm db:push               # Push schema changes
pnpm db:studio             # Open Drizzle Studio
```

## 📝 API Endpoints

When running `pnpm dev`, Mastra exposes:

```bash
# Workflows
POST /workflows/transcript-workflow/run

# Agents
POST /agents/youtubeAgent/chat
GET  /agents/youtubeAgent/threads

# Tools (used internally by agents)
POST /tools/video-search/execute
```

## 🔗 Integration Points

### MCP Server Integration

The project uses [Smithery.ai](https://smithery.ai) MCP servers for YouTube API access:

```typescript
// Automatic tool integration with authentication
const mcp = new MCPClient({
  servers: {
    youtubeMcp: {
      url: "https://server.smithery.ai/@jikime/py-mcp-youtube-toolbox/mcp",
      apiKey: process.env.SMITHERY_API_KEY,
    },
  },
});

// Agent gets both custom tools + MCP tools
const agent = new Agent({
  tools: { videoSearchTool, ...(await mcp.getTools()) },
});
```

### Extension Ideas

This template can be extended for:

- **Multi-channel processing** - Process entire YouTube channels
- **Real-time updates** - Subscribe to new videos via webhooks
- **Advanced analytics** - Sentiment analysis, trend detection
- **Multi-modal search** - Add image/thumbnail search capabilities

## 📚 Related Documentation

- [Mastra Documentation](https://docs.mastra.ai)
- [PostgreSQL pgvector](https://github.com/pgvector/pgvector)
- [Deepgram API](https://developers.deepgram.com)
- [Model Context Protocol](https://modelcontextprotocol.io)

## 🤝 Contributing

This is a learning template - feel free to:

- Fork and adapt for your use cases
- Submit improvements via pull requests
- Share your extensions and learnings

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with ❤️ using [Mastra](https://mastra.ai) - The AI framework for building intelligent applications.**
