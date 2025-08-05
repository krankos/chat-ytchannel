import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PgVector } from "@mastra/pg";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { and, like, or, sql } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

const vectorStore = new PgVector({
  connectionString,
});

const pool = new Pool({
  connectionString,
});
const db = drizzle(pool, { schema });

// Helper function for querying videos with metadata filters
const queryVideos = async (filters?: {
  summaryContains?: string;
  speakerContains?: string;
  topicContains?: string;
  tags?: string[];
  speakers?: string[];
  topics?: string[];
}) => {
  const conditions = [];

  // Text-based searches on AI-extracted content
  if (filters?.summaryContains) {
    conditions.push(
      like(sql`metadata->>'summary'`, `%${filters.summaryContains}%`)
    );
  }

  if (filters?.speakerContains) {
    conditions.push(
      like(sql`metadata->'speakers'::text`, `%${filters.speakerContains}%`)
    );
  }

  if (filters?.topicContains) {
    conditions.push(
      like(sql`metadata->'keyTopics'::text`, `%${filters.topicContains}%`)
    );
  }

  // Array filters: consistent case-insensitive pattern matching
  if (filters?.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map((tag) =>
      like(sql`lower(metadata->'tags'::text)`, `%"${tag.toLowerCase()}"%`)
    );
    conditions.push(or(...tagConditions));
  }

  if (filters?.speakers && filters.speakers.length > 0) {
    const speakerConditions = filters.speakers.map((speaker) =>
      like(
        sql`lower(metadata->'speakers'::text)`,
        `%"${speaker.toLowerCase()}"%`
      )
    );
    conditions.push(or(...speakerConditions));
  }

  if (filters?.topics && filters.topics.length > 0) {
    const topicConditions = filters.topics.map((topic) =>
      like(
        sql`lower(metadata->'keyTopics'::text)`,
        `%"${topic.toLowerCase()}"%`
      )
    );
    conditions.push(or(...topicConditions));
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
};

const searchChunks = async ({
  query,
  videoIds,
  topK = 10,
}: {
  query: string;
  videoIds?: string[];
  topK?: number;
}) => {
  const pgFilter: Record<string, string | string[] | object> = {};

  if (videoIds && videoIds.length > 0) {
    pgFilter.videoId = { $in: videoIds };
  }

  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: query,
  });

  return await vectorStore.query({
    indexName: "video_chunks",
    queryVector: embedding,
    topK,
    filter: pgFilter,
    includeVector: false,
  });
};

const enrichChunksWithVideoData = async (chunks: unknown[]) => {
  const videoIds = [
    ...new Set(
      chunks
        .map(
          (c) =>
            (c as Record<string, unknown>)?.metadata as Record<string, unknown>
        )
        .map((metadata) => metadata?.videoId as string)
        .filter(Boolean)
    ),
  ];

  if (videoIds.length === 0) return chunks;

  const videos = await db
    .select()
    .from(schema.videos)
    .where(sql`id = ANY(${videoIds})`);

  const videoMap = new Map(videos.map((v) => [v.id, v]));

  return chunks.map((chunk) => {
    const chunkRecord = chunk as Record<string, unknown>;
    const metadata = chunkRecord?.metadata as Record<string, unknown>;
    const videoId = metadata?.videoId as string;
    const video = videoMap.get(videoId);

    if (!video) return chunk;

    const videoMetadata = (video.metadata as Record<string, unknown>) || {};

    return {
      ...(chunk as object),
      videoInfo: {
        videoId: video.id, // This is what the future MCP server will need
        // Only include AI-extracted metadata (not YouTube native data)
        summary: videoMetadata.summary,
        speakers: videoMetadata.speakers || [],
        keyTopics: videoMetadata.keyTopics || [],
        tags: videoMetadata.tags || [],
        processedAt: video.createdAt,
      },
    };
  });
};

const unifiedSearch = async ({
  query,
  filter,
  topK = 10,
}: {
  query?: string;
  filter?: {
    speakers?: string[];
    topics?: string[];
    tags?: string[];
    speakerContains?: string;
    topicContains?: string;
    summaryContains?: string;
  };
  topK?: number;
}) => {
  // Simple: if no query, just browse videos by AI-extracted metadata
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

  // Get video IDs if filtering
  let videoIds: string[] | undefined;
  if (filter) {
    const videos = await queryVideos(filter);
    videoIds = videos.map((v) => v.id);

    if (videoIds.length === 0) {
      return { videos: [], chunks: [] };
    }
  }

  // Search chunks
  const rawChunks = await searchChunks({ query, videoIds, topK });

  // Enrich with video data
  const enrichedChunks = await enrichChunksWithVideoData(
    rawChunks as unknown[]
  );

  return { videos: [], chunks: enrichedChunks };
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
        speakers: z
          .array(z.string())
          .optional()
          .describe("Filter by speaker names from transcript analysis"),
        topics: z
          .array(z.string())
          .optional()
          .describe("Filter by topics extracted from transcript"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Filter by AI-generated tags"),
        speakerContains: z
          .string()
          .optional()
          .describe("Search for partial speaker names"),
        topicContains: z
          .string()
          .optional()
          .describe("Search for partial topic names"),
        summaryContains: z
          .string()
          .optional()
          .describe("Search within AI-generated video summaries"),
      })
      .optional()
      .describe("Filter by AI-extracted metadata from transcript analysis"),
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

export { queryVideos };
