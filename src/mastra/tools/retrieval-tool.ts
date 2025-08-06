import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PgVector } from "@mastra/pg";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { and, like, sql, inArray } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

// Vector store for semantic search of video chunks
// Expects chunks to be pre-indexed in "video_chunks" table
const vectorStore = new PgVector({
  connectionString,
});

// Regular database connection for metadata queries
const pool = new Pool({
  connectionString,
});
const db = drizzle(pool, { schema });

// Filter videos by AI-extracted metadata (speakers, tags, etc.)
const queryVideos = async (filters?: { speaker?: string; tag?: string }) => {
  try {
    const conditions = [];

    // Simple case-insensitive searches on JSONB metadata
    if (filters?.speaker) {
      conditions.push(
        like(sql`(metadata->'speakers')::text`, `%${filters.speaker}%`)
      );
    }

    if (filters?.tag) {
      conditions.push(
        like(
          sql`lower((metadata->'tags')::text)`,
          `%"${filters.tag.toLowerCase()}"%`
        )
      );
    }

    const result = await db
      .select()
      .from(schema.videos)
      .where(and(...conditions))
      .orderBy(schema.videos.createdAt);

    return (
      result?.map((row) => {
        const metadata = (row.metadata as Record<string, unknown>) || {};
        return {
          id: row.id,
          fullTranscript: row.fullTranscript,
          metadata,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          // Extract commonly used fields for convenience
          summary: metadata.summary,
          speakers: metadata.speakers || [],
          keyTopics: metadata.keyTopics || [],
          actionItems: metadata.actionItems || [],
          tags: metadata.tags || [],
          duration: metadata.duration,
        };
      }) || []
    );
  } catch (error) {
    console.error("Failed to query videos:", error);
    return [];
  }
};

// Semantic search through video transcript chunks
const searchChunks = async ({
  query,
  videoIds,
  topK = 10,
}: {
  query: string;
  videoIds?: string[];
  topK?: number;
}) => {
  try {
    const pgFilter: Record<string, string | string[] | object> = {};

    // Optionally filter by specific video IDs
    if (videoIds && videoIds.length > 0) {
      pgFilter.videoId = { $in: videoIds };
    }

    // Generate embedding for the search query
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });

    // Perform vector similarity search
    return await vectorStore.query({
      indexName: "video_chunks",
      queryVector: embedding,
      topK,
      filter: pgFilter,
      includeVector: false,
    });
  } catch (error) {
    console.error("Failed to search chunks:", error);
    return [];
  }
};

// Enrich vector search results with video metadata
const enrichChunksWithVideoData = async (chunks: unknown[]) => {
  try {
    // Extract unique video IDs from chunk metadata
    const videoIds = [
      ...new Set(
        chunks
          .map(
            (c) =>
              (c as Record<string, unknown>)?.metadata as Record<
                string,
                unknown
              >
          )
          .map((metadata) => metadata?.videoId as string)
          .filter(Boolean)
      ),
    ];

    if (videoIds.length === 0) return chunks;

    // Batch fetch video data
    const videos = await db
      .select()
      .from(schema.videos)
      .where(inArray(schema.videos.id, videoIds));

    const videoMap = new Map(videos.map((v) => [v.id, v]));

    // Combine chunk data with video metadata
    return chunks.map((chunk) => {
      const chunkRecord = chunk as Record<string, unknown>;
      const metadata = chunkRecord?.metadata as Record<string, unknown>;
      const videoId = metadata?.videoId as string;
      const video = videoMap.get(videoId);

      if (!video) return chunk;

      const videoMetadata = (video.metadata as Record<string, unknown>) || {};

      return {
        ...(chunk as object),
        // Include similarity score from vector search
        score: chunkRecord.score,
        videoInfo: {
          videoId: video.id, // This is what the MCP server will need
          // Only include AI-extracted metadata (not YouTube native data)
          summary: videoMetadata.summary,
          speakers: videoMetadata.speakers || [],
          keyTopics: videoMetadata.keyTopics || [],
          tags: videoMetadata.tags || [],
          processedAt: video.createdAt,
        },
      };
    });
  } catch (error) {
    console.error("Failed to enrich chunks:", error);
    return chunks;
  }
};

// Main search function: combines metadata filtering with semantic search
const unifiedSearch = async ({
  query,
  filter,
  topK = 10,
}: {
  query?: string;
  filter?: {
    speaker?: string;
    tag?: string;
  };
  topK?: number;
}) => {
  try {
    // Browse mode: just filter videos by metadata (no semantic search)
    if (!query?.trim()) {
      if (!filter) {
        return { videos: [], chunks: [] };
      }

      const videos = await queryVideos(filter);
      return {
        videos: videos.map((v) => ({
          videoId: v.id, // Key for future MCP calls
          summary: v.summary,
          speakers: v.speakers,
          keyTopics: v.keyTopics,
          tags: v.tags,
          processedAt: v.createdAt,
        })),
        chunks: [],
      };
    }

    // Search mode: semantic search with optional metadata filtering
    // Two-stage filtering approach for efficiency and relevance:
    // 1. First filter videos by metadata (fast, precise)
    // 2. Then search chunks only within those videos (focused semantic search)
    let videoIds: string[] | undefined;
    if (filter) {
      const videos = await queryVideos(filter);
      videoIds = videos.map((v) => v.id);

      // Early return if no videos match the filter
      if (videoIds.length === 0) {
        return { videos: [], chunks: [] };
      }
    }

    // Perform semantic search on transcript chunks
    // If videoIds is defined, only searches within filtered videos
    const rawChunks = await searchChunks({ query, videoIds, topK });

    // Enrich results with video metadata
    const enrichedChunks = await enrichChunksWithVideoData(
      rawChunks as unknown[]
    );

    return { videos: [], chunks: enrichedChunks };
  } catch (error) {
    console.error("Search failed:", error);
    return { videos: [], chunks: [] };
  }
};

export const videoSearchTool = createTool({
  id: "video-search",
  description:
    "Search processed YouTube videos by transcript content and AI-extracted insights. Provides content intelligence (speakers, topics, summaries) that complements YouTube MCP server data (titles, analytics, thumbnails).",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Search query for semantic content search within transcripts"),
    filter: z
      .object({
        speaker: z
          .string()
          .optional()
          .describe("Filter by speaker name (partial match)"),
        tag: z.string().optional().describe("Filter by a specific tag"),
      })
      .optional()
      .describe("Simple filters for videos"),
    topK: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of results to return"),
  }),
  execute: async ({ context }) => {
    return unifiedSearch(context);
  },
});
