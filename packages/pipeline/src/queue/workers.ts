import { Worker, type Processor } from "bullmq";
import { getRedisConnection } from "./setup.js";
import type {
  IntakeJobData,
  AnalysisJobData,
  ScriptingJobData,
  GenerationJobData,
  QCJobData,
  AssemblyJobData,
  DeliveryJobData,
} from "./setup.js";
import { processIntake } from "../stages/intake.js";
import { processAnalysis } from "../stages/analyze.js";
import { processScripting } from "../stages/script.js";
import { processGeneration } from "../stages/generate.js";
import { processQC } from "../stages/qc.js";
import { processAssembly } from "../stages/assemble.js";

interface WorkerConfig {
  name: string;
  processor: Processor;
  concurrency: number;
}

const workers: WorkerConfig[] = [
  { name: "intake", processor: processIntake as Processor, concurrency: 10 },
  { name: "analysis", processor: processAnalysis as Processor, concurrency: 5 },
  { name: "scripting", processor: processScripting as Processor, concurrency: 10 },
  { name: "generation", processor: processGeneration as Processor, concurrency: 20 },
  { name: "qc", processor: processQC as Processor, concurrency: 10 },
  { name: "assembly", processor: processAssembly as Processor, concurrency: 3 },
];

export function startAllWorkers(): Worker[] {
  const connection = getRedisConnection();
  return workers.map(({ name, processor, concurrency }) => {
    const worker = new Worker(name, processor, { connection, concurrency });

    worker.on("completed", (job) => {
      console.log(`[${name}] Job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
      console.error(`[${name}] Job ${job?.id} failed:`, err.message);
    });

    console.log(`[worker] ${name} started (concurrency: ${concurrency})`);
    return worker;
  });
}
