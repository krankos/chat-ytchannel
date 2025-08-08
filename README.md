# Chat with YouTube Videos 🎬

Want to talk to YouTube videos? This template lets you **chat with the Mastra AI YouTube channel** using AI! Ask questions, get summaries, find topics - just like having a conversation.

> 🎯 **Built for Mastra AI**: This template works with the **Mastra AI YouTube channel**, but you can use it with any YouTube channel!

## What This Does 🤖

This template creates a chatbot that knows everything about YouTube videos:

**🎯 Chat with Videos**: Ask "What did they say about workflows?" and get smart answers from Mastra AI videos.

**📚 Learn Mastra**: Build something fun while learning Mastra concepts like workflows, agents, and tools.

**🔄 Use Any Channel**: Want different videos? Just change the video IDs.

### How It Works ✨

1. **Process Videos**: Download and transcribe Mastra AI YouTube videos (or any videos!)
2. **Extract Knowledge**: AI pulls out speakers, topics, and key insights
3. **Chat Away**: Ask questions and get answers based on the video content

### Why This is Cool 🚀

- **🎬 Talk to Videos**: Get instant answers about Mastra AI content
- **🔍 Smart Search**: Find videos by topic, speaker, or just ask in plain English
- **📚 Learn by Doing**: Pick up Mastra skills while building something useful
- **🛠️ Ready to Use**: Built for real use, not just demos

## Quick Start 🏃‍♂️

### What You Need 📋

- Node.js 20.9.0+
- PostgreSQL with pgvector
- OpenAI API key
- Deepgram API key
- Smithery.ai account

### Get Started 🔧

```bash
# Get the code
git clone <repository-url>
cd chat-ytchannel
pnpm install

# Add your API keys
cp .env.example .env
# Edit .env with your keys

# Set up database
pnpm db:push

# Start it up!
pnpm dev
```

### Your API Keys 🔑

Put these in your `.env` file:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# AI Services
OPENAI_API_KEY=your_openai_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here

# YouTube Access
SMITHERY_API_KEY=your_smithery_key_here
SMITHERY_PROFILE=your_profile_here
```

## How to Use It 🎮

### 1. Process Some Videos 🍿

First, let's teach the AI about some Mastra videos:

```bash
# Start the server
pnpm dev

# Process a Mastra AI video
curl -X POST http://localhost:4111/workflows/transcript-workflow/run \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "dQw4w9WgXcQ",
    "keywords": ["AI", "Mastra", "workflows"]
  }'
```

This will:

- Download the video's audio
- Turn speech into text
- Pull out topics, speakers, and summaries
- Make it searchable

### 2. Start Chatting! 💬

Go to `http://localhost:4111` and try asking:

**For Mastra AI videos:**

- "What did they say about building agents?"
- "Find videos about workflows"
- "Summarize the latest tool tutorial"
- "Who talks about memory in the videos?"

The AI combines:

- **Video content** from processed transcripts
- **YouTube data** (titles, descriptions, etc.)
- **Smart conversation** that remembers what you talked about

### 3. Use Different Channels 🌟

Want to chat with other YouTube channels? Just process their videos:

```bash
# Process any YouTube video
curl -X POST http://localhost:4111/workflows/transcript-workflow/run \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "any-youtube-video-id",
    "keywords": ["relevant", "terms"]
  }'
```

## What's Inside? 🔧

This template shows you how to use key Mastra features:

### The Tech Stack 🛠️

- **Workflows**: Multi-step processes that handle errors and keep going
- **Tools**: Functions the AI can call to search and analyze videos
- **Agents**: Chatbots that remember conversations and use tools smartly
- **MCP**: Connect to external APIs (like YouTube) seamlessly

### The Main Parts ✨

- **`transcriptWorkflow`**: Processes videos behind the scenes
- **`youtubeAgent`**: Your chat buddy who knows about videos
- **`videoSearchTool`**: Smart search that's both fast and accurate

### What Powers It ⚡

- **Database**: PostgreSQL + pgvector for storing video data
- **AI**: OpenAI for chat + Deepgram for transcription
- **YouTube**: Access via Smithery.ai MCP servers
- **Framework**: Mastra with TypeScript

## Database 🗄️

Simple schema that stores everything you need:

```sql
-- Videos: transcripts and AI insights
CREATE TABLE videos (
  id TEXT PRIMARY KEY,              -- YouTube video ID
  fullTranscript TEXT,              -- Complete transcript
  metadata JSONB,                   -- AI insights (summary, speakers, topics)
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);

-- Chunks: searchable pieces
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  videoId TEXT REFERENCES videos(id),
  data JSONB,                       -- Chunk content + metadata
  createdAt TIMESTAMP
);
```

## Customize It 🎨

### Add More Metadata

```typescript
// In transcript-workflow.ts, add more fields
const videoDataSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  keyTopics: z.array(z.string()),
  speakers: z.array(z.string()),
});
```

### Add Search Filters

```typescript
// In retrieval-tool.ts, add date filtering
const queryVideos = async (filters?: {
  speaker?: string;
  tag?: string;
  dateRange?: { start: Date; end: Date };
}) => {
  // Your filtering logic
};
```

## Commands 💻

```bash
# Development
pnpm dev                    # Start with playground
pnpm build                  # Build for production
pnpm start                  # Run production

# Database
pnpm db:push               # Update schema
pnpm db:studio             # View data
```

## Common Issues 🔧

**"Failed to download video"**

- Check the video ID is correct
- Some videos can't be downloaded
- Try a different video

**"Database connection failed"**

- Make sure PostgreSQL is running
- Check your `DATABASE_URL`
- Install pgvector extension

**"No search results"**

- Process some videos first
- Check your API keys work
- Make sure the database has data

## What Makes This Special ✨

### Learn by Building

- **Real Example**: Not just theory - you build something useful
- **Mastra Patterns**: See how workflows, tools, and agents work together
- **Best Practices**: Learn the right way to structure Mastra apps

### Production Ready

- **Error Handling**: Things break, but the app keeps working
- **Type Safety**: TypeScript catches bugs before they happen
- **Performance**: Built to handle lots of videos efficiently

### Easy to Extend

- **Any Channel**: Works with any YouTube channel
- **Add Features**: Easy to add new search filters or metadata
- **Integration**: Connect to other services via MCP

## Ideas for More 💡

This template can become:

- **Multi-channel processor** - Handle entire YouTube channels
- **Real-time updates** - Auto-process new videos
- **Analytics dashboard** - Track trends and engagement
- **Slack bot** - Ask questions from your team chat
- **API service** - Power other apps with video intelligence

## Learn More 📚

- [Mastra Documentation](https://docs.mastra.ai)
- [PostgreSQL pgvector](https://github.com/pgvector/pgvector)
- [Deepgram API](https://developers.deepgram.com)
- [Model Context Protocol](https://modelcontextprotocol.io)

## Contributing 🤝

This is a learning template! Feel free to:

- Fork it and make it your own
- Submit improvements
- Share what you built with it

---

**Built with ❤️ using [Mastra](https://mastra.ai) - The AI framework that makes building actually fun.**
