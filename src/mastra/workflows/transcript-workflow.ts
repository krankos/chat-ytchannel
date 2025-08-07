import ytdl, { type videoFormat } from "@distube/ytdl-core";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@deepgram/sdk";
import { openai } from "@ai-sdk/openai";
import { generateObject, embedMany } from "ai";
import { PgVector } from "@mastra/pg";
import { Pool } from "pg";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import type { Video, NewVideo, NewChunk } from "../db/schema";
import { eq, sql } from "drizzle-orm";

// Schema for extracting structured data from video transcript
const videoDataSchema = z.object({
  summary: z.string().describe("A comprehensive summary of the video content"),
  keyTopics: z
    .array(z.string())
    .describe("Main topics or themes discussed in the video"),
  speakers: z
    .array(z.string())
    .describe("Identified speakers or participants in the video")
    .nullable(),
  actionItems: z
    .array(z.string())
    .describe("Any action items, recommendations, or conclusions mentioned")
    .nullable(),
  tags: z
    .array(z.string())
    .describe("Relevant tags or categories for the video content"),
});

const defaultKeywords = [
  "AI",
  "Typescript",
  "Mastra",
  "RAG",
  "Agent",
  "Shane",
  "Abhi",
  "Shreeda",
  "MCP",
  "vNext",
  "Netlify",
  "Vercel",
  "Cloudflare",
];

// Validate required environment variables
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

if (!process.env.DG_API_KEY) {
  throw new Error("DEEPGRAM_API_KEY environment variable is required");
}

const vectorStore = new PgVector({
  connectionString,
});

const pool = new Pool({
  connectionString,
});
const db = drizzle(pool, { schema });

const checkVideoExists = async ({
  videoId,
}: {
  videoId: string;
}): Promise<{ exists: boolean; videoRecord?: Video }> => {
  try {
    console.log(`Checking if video ${videoId} already exists...`);

    // Check if video exists
    const result = await db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId));

    if (result && result.length > 0) {
      console.log(`Video ${videoId} already exists in database`);
      const record = result[0];
      return {
        exists: true,
        videoRecord: {
          id: record.id,
          fullTranscript: record.fullTranscript,
          metadata: record.metadata as Record<string, unknown>,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      };
    }

    return { exists: false };
  } catch (error) {
    console.error("Error checking video existence:", error);
    // Continue processing if check fails
    return { exists: false };
  }
};

const downloadVideo = async ({
  videoId,
}: {
  videoId: string;
}): Promise<{ videoFileName: string }> => {
  console.log(`Downloading video with ID: ${videoId}`);
  const outputDir = "./video/";

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    ytdl
      .getInfo(videoUrl)
      .then((info) => {
        const title = info.videoDetails.title
          .replace(/[^\w\s-]/g, "") // Remove special characters
          .replace(/\s+/g, "_"); // Replace spaces with underscores

        // Find best audio format
        const audioFormats = info.formats.filter(
          (format: videoFormat) => format.hasAudio && !format.hasVideo
        );

        if (audioFormats.length === 0) {
          throw new Error("No audio-only formats available");
        }

        // Sort by bitrate to get highest quality
        const bestAudioFormat = audioFormats.sort(
          (a: videoFormat, b: videoFormat) =>
            (b.audioBitrate || 0) - (a.audioBitrate || 0)
        )[0];

        const container = bestAudioFormat.container || "webm";
        const fileName = `${title}_${videoId}.${container}`;
        const filePath = path.join(outputDir, fileName);

        console.log(
          `Downloading audio (${bestAudioFormat.audioBitrate}kbps ${container}): ${title}`
        );

        const audioStream = ytdl(videoUrl, {
          filter: "audioonly",
          quality: "highestaudio",
        });
        const writeStream = fs.createWriteStream(filePath);

        // Track download progress
        let downloadedBytes = 0;
        const contentLength = parseInt(
          info.formats.find((f: videoFormat) => f.hasAudio && !f.hasVideo)
            ?.contentLength || "0"
        );

        audioStream.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (contentLength > 0) {
            const percent = ((downloadedBytes / contentLength) * 100).toFixed(
              1
            );
            console.log(`${percent}% downloaded`);
          }
        });

        audioStream.on("error", (error: Error) => {
          console.error("Download error:", error);
          reject(error);
        });

        writeStream.on("error", (error: Error) => {
          console.error("Write error:", error);
          reject(error);
        });

        writeStream.on("finish", () => {
          console.log(`Downloaded ${fileName}`);
          resolve({ videoFileName: filePath });
        });

        audioStream.pipe(writeStream);
      })
      .catch((error) => {
        console.error("Error getting video info:", error);
        reject(error);
      });
  });
};

const getTranscript = async ({
  videoFileName,
  keywords,
}: {
  videoFileName: string;
  keywords?: string[];
}): Promise<{
  transcript: string;
  transcriptFileName: string;
  videoFileDeleted: boolean;
}> => {
  console.log(`Starting transcription for: ${videoFileName}`);

  const deepgram = createClient(process.env.DG_API_KEY);

  const { result } = await deepgram.listen.prerecorded.transcribeFile(
    fs.createReadStream(videoFileName),
    {
      punctuate: true,
      keywords: keywords,
    }
  );

  if (!result?.results?.channels[0]?.alternatives[0]) {
    throw new Error("No transcription results found");
  }

  const transcript = result.results.channels[0].alternatives[0].transcript;

  // Save transcript to file
  const outputDir = "./transcription/";
  const baseFileName = path.basename(
    videoFileName,
    path.extname(videoFileName)
  );
  const transcriptFileName = path.join(
    outputDir,
    `${baseFileName}_transcript.txt`
  );

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(transcriptFileName, transcript, "utf8");
  console.log(`Transcript saved to: ${transcriptFileName}`);

  // Clean up video file
  fs.unlinkSync(videoFileName);

  return {
    transcript,
    transcriptFileName,
    videoFileDeleted: true,
  };
};

// Function to chunk text into smaller pieces for embedding
const chunkText = (
  text: string,
  chunkSize: number = 1000,
  overlap: number = 100
): string[] => {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);

    // Don't cut words in half
    if (end < text.length) {
      const lastSpaceIndex = chunk.lastIndexOf(" ");
      if (lastSpaceIndex > 0) {
        chunks.push(chunk.slice(0, lastSpaceIndex));
        start += lastSpaceIndex + 1 - overlap;
      } else {
        chunks.push(chunk);
        start += chunkSize - overlap;
      }
    } else {
      chunks.push(chunk);
      break;
    }
  }

  return chunks;
};

// Function to extract structured data from transcript using AI
const extractVideoData = async ({
  transcript,
  videoId,
}: {
  transcript: string;
  videoId: string;
}): Promise<{
  extractedData: z.infer<typeof videoDataSchema>;
  videoId: string;
}> => {
  console.log("Extracting structured data from transcript...");

  const { object } = await generateObject({
    model: openai("o3-mini"),
    schema: videoDataSchema,
    prompt: `Analyze this video transcript and extract structured information:

Transcript: ${transcript}

Please extract:
- A comprehensive summary (2-3 sentences)
- Main topics or themes discussed
- Any speakers or participants mentioned
- Action items, recommendations, or conclusions
- Relevant tags or categories`,
  });

  return {
    extractedData: object,
    videoId,
  };
};

// Function to chunk and embed transcript for RAG
const chunkAndEmbedTranscript = async ({
  transcript,
  transcriptFileName,
  videoId,
  extractedData,
}: {
  transcript: string;
  transcriptFileName: string;
  videoId: string;
  extractedData: z.infer<typeof videoDataSchema>;
}): Promise<{
  chunksCreated: number;
  embeddingsGenerated: number;
  videoRecord: NewVideo;
  chunkRecords: NewChunk[];
}> => {
  console.log("Chunking transcript and generating embeddings...");

  // Create chunks from the transcript
  const chunks = chunkText(transcript, 500, 100);
  console.log(`Created ${chunks.length} chunks`);

  // Create video record with metadata
  const videoRecord = {
    id: videoId,
    transcriptFileName,
    fullTranscript: transcript,
    metadata: {
      summary: extractedData.summary,
      speakers: extractedData.speakers,
      keyTopics: extractedData.keyTopics,
      actionItems: extractedData.actionItems,
      tags: extractedData.tags,
      chunkCount: chunks.length,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Generate embeddings
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: chunks,
  });

  // Create chunk records
  const chunkRecords = chunks.map((chunk, index) => ({
    id: `${videoId}_chunk_${index}`,
    videoId,
    data: {
      chunkIndex: index,
      content: chunk,
      embedding: embeddings[index],
      metadata: {
        chunkIndex: index,
        totalChunks: chunks.length,
        topics: extractedData.keyTopics,
      },
    },
    createdAt: new Date(),
  }));

  // Store in database
  await db
    .insert(schema.videos)
    .values(videoRecord)
    .onConflictDoUpdate({
      target: schema.videos.id,
      set: {
        fullTranscript: videoRecord.fullTranscript,
        metadata: videoRecord.metadata,
        updatedAt: new Date(),
      },
    });

  // Store chunks
  for (const chunk of chunkRecords) {
    await db.insert(schema.chunks).values(chunk).onConflictDoNothing();
  }

  // Create vector index if needed
  try {
    await vectorStore.createIndex({
      indexName: "video_chunks",
      dimension: 1536,
    });
  } catch {
    // Index might already exist
    console.log("Vector index already exists or created");
  }

  // Store embeddings in vector database
  await vectorStore.upsert({
    indexName: "video_chunks",
    vectors: embeddings,
    metadata: chunkRecords.map((chunk) => ({
      chunkId: chunk.id,
      videoId: chunk.videoId,
      content: chunk.data.content,
    })),
    ids: chunkRecords.map((chunk) => chunk.id),
  });

  console.log(`Successfully processed ${chunks.length} chunks`);

  return {
    chunksCreated: chunks.length,
    embeddingsGenerated: embeddings.length,
    videoRecord,
    chunkRecords,
  };
};

const checkVideoStep = createStep({
  id: "check-video",
  description: "Checks if the video has already been processed",
  inputSchema: z.object({
    videoId: z.string().describe("The ID of the YouTube video to check"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  outputSchema: z.object({
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  execute: async ({ inputData }) => {
    const result = await checkVideoExists(inputData);
    return {
      videoId: inputData.videoId,
      exists: result.exists,
      videoRecord: result.videoRecord,
      keywords: inputData.keywords,
    };
  },
});

const downloadVideoStep = createStep({
  id: "download-video",
  description: "Downloads a YouTube video by its ID (skips if already exists)",
  inputSchema: z.object({
    videoId: z.string().describe("The ID of the YouTube video to download"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  outputSchema: z.object({
    videoFileName: z
      .string()
      .optional()
      .describe("The path to the downloaded video file"),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  execute: async ({ inputData }) => {
    // If video already exists, skip download
    if (inputData.exists) {
      console.log(
        `Video ${inputData.videoId} already exists, skipping download`
      );
      return {
        videoId: inputData.videoId,
        exists: true,
        videoRecord: inputData.videoRecord,
        keywords: inputData.keywords,
      };
    }

    // Download the video
    const result = await downloadVideo({ videoId: inputData.videoId });
    return {
      ...result,
      videoId: inputData.videoId,
      exists: false,
      keywords: inputData.keywords,
    };
  },
});

const getTranscriptStep = createStep({
  id: "get-transcript",
  description:
    "Gets the transcript of a downloaded YouTube video (skips if already exists)",
  inputSchema: z.object({
    videoFileName: z
      .string()
      .optional()
      .describe("The path to the downloaded video file"),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  outputSchema: z.object({
    transcript: z.string().describe("The transcribed text from the video"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
  }),
  execute: async ({ inputData }) => {
    // If video already exists, return existing data
    if (inputData.exists && inputData.videoRecord) {
      console.log(
        `Video ${inputData.videoId} already exists, using existing transcript`
      );
      return {
        transcript: inputData.videoRecord.fullTranscript,
        transcriptFileName: inputData.videoRecord.transcriptFileName,
        videoFileDeleted: true,
        videoId: inputData.videoId,
        exists: true,
        videoRecord: inputData.videoRecord,
      };
    }

    // Transcribe the video
    if (!inputData.videoFileName) {
      throw new Error("Video file name is required for transcription");
    }

    const result = await getTranscript({
      videoFileName: inputData.videoFileName,
      keywords: inputData.keywords,
    });

    return {
      ...result,
      videoId: inputData.videoId,
      exists: false,
    };
  },
});

const extractDataStep = createStep({
  id: "extract-data",
  description:
    "Extracts structured data from the video transcript using AI (skips if already exists)",
  inputSchema: z.object({
    transcript: z.string().describe("The video transcript text"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
    videoRecord: z.any().optional().describe("Existing video record if found"),
  }),
  outputSchema: z.object({
    transcript: z.string().describe("The video transcript text"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    extractedData: videoDataSchema.describe(
      "Structured data extracted from the transcript"
    ),
    videoId: z.string().describe("The ID of the YouTube video"),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
  }),
  execute: async ({ inputData }) => {
    // If video already exists, return existing extracted data
    if (inputData.exists && inputData.videoRecord) {
      console.log(
        `Video ${inputData.videoId} already exists, using existing data`
      );

      const metadata = inputData.videoRecord.metadata || {};
      const extractedData = {
        summary: metadata.summary || "No summary available",
        keyTopics: metadata.keyTopics || [],
        speakers: metadata.speakers || null,
        actionItems: metadata.actionItems || null,
        tags: metadata.tags || [],
      };

      return {
        transcript: inputData.transcript,
        transcriptFileName: inputData.transcriptFileName,
        videoFileDeleted: inputData.videoFileDeleted,
        extractedData,
        videoId: inputData.videoId,
        exists: true,
      };
    }

    // Extract new data from transcript
    const result = await extractVideoData({
      transcript: inputData.transcript,
      videoId: inputData.videoId,
    });

    return {
      transcript: inputData.transcript,
      transcriptFileName: inputData.transcriptFileName,
      videoFileDeleted: inputData.videoFileDeleted,
      ...result,
      exists: false,
    };
  },
});

const chunkAndEmbedStep = createStep({
  id: "chunk-and-embed",
  description:
    "Chunks the transcript and generates embeddings for RAG (skips if already exists)",
  inputSchema: z.object({
    transcript: z.string().describe("The video transcript text"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    videoId: z.string().describe("The ID of the YouTube video"),
    extractedData: videoDataSchema.describe(
      "Structured data extracted from the transcript"
    ),
    exists: z
      .boolean()
      .describe("Whether the video already exists in database"),
  }),
  outputSchema: z.object({
    transcript: z.string().describe("The video transcript text"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    extractedData: videoDataSchema.describe(
      "Structured data extracted from the transcript"
    ),
    chunksCreated: z.number().describe("Number of chunks created"),
    embeddingsGenerated: z.number().describe("Number of embeddings generated"),
    videoRecord: z.any().describe("The video record stored in database"),
    chunkRecords: z
      .array(z.any())
      .describe("The chunk records stored in database"),
  }),
  execute: async ({ inputData }) => {
    // If video already exists, get existing chunk count
    if (inputData.exists) {
      console.log(
        `Video ${inputData.videoId} already exists, retrieving existing chunks`
      );

      const chunksResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.chunks)
        .where(eq(schema.chunks.videoId, inputData.videoId));
      const chunksCount = chunksResult[0]?.count || 0;

      const chunkRecords = await db
        .select()
        .from(schema.chunks)
        .where(eq(schema.chunks.videoId, inputData.videoId));

      const videoResult = await db
        .select()
        .from(schema.videos)
        .where(eq(schema.videos.id, inputData.videoId));
      const videoRecord = videoResult[0];

      return {
        transcript: inputData.transcript,
        transcriptFileName: inputData.transcriptFileName,
        videoFileDeleted: true,
        extractedData: inputData.extractedData,
        chunksCreated: chunksCount,
        embeddingsGenerated: chunksCount,
        videoRecord,
        chunkRecords: chunkRecords || [],
      };
    }

    // Process the transcript normally
    const result = await chunkAndEmbedTranscript(inputData);
    return {
      transcript: inputData.transcript,
      transcriptFileName: inputData.transcriptFileName,
      videoFileDeleted: inputData.videoFileDeleted,
      extractedData: inputData.extractedData,
      ...result,
    };
  },
});

const transcriptWorkflow = createWorkflow({
  id: "transcript-workflow",
  description:
    "Downloads a YouTube video, transcribes it, extracts structured data, and creates embeddings for RAG",
  inputSchema: z.object({
    videoId: z.string().describe("The ID of the YouTube video to transcribe"),
    keywords: z
      .array(z.string())
      .optional()
      .default(defaultKeywords)
      .describe("Keywords to pass to Deepgram for transcription"),
  }),
  outputSchema: z.object({
    transcript: z.string().describe("The transcribed text from the video"),
    transcriptFileName: z
      .string()
      .describe("The path to the saved transcript file"),
    videoFileDeleted: z
      .boolean()
      .describe("Whether the original video file was deleted"),
    extractedData: videoDataSchema.describe(
      "Structured data extracted from the transcript"
    ),
    chunksCreated: z.number().describe("Number of chunks created"),
    embeddingsGenerated: z.number().describe("Number of embeddings generated"),
    videoRecord: z.any().describe("The video record stored in database"),
    chunkRecords: z
      .array(z.any())
      .describe("The chunk records stored in database"),
  }),
})
  .then(checkVideoStep)
  .then(downloadVideoStep)
  .then(getTranscriptStep)
  .then(extractDataStep)
  .then(chunkAndEmbedStep);

transcriptWorkflow.commit();

export { transcriptWorkflow };
