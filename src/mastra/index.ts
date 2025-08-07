import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { transcriptWorkflow } from "./workflows/transcript-workflow";
import { youtubeAgent } from "./agents/yt-agent";

export const mastra = new Mastra({
  workflows: { transcriptWorkflow },
  agents: { youtubeAgent },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: "file:../mastra.db",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
