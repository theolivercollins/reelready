// Queue setup and job types
export {
  intakeQueue,
  analysisQueue,
  scriptingQueue,
  generationQueue,
  qcQueue,
  assemblyQueue,
  deliveryQueue,
  type IntakeJobData,
  type AnalysisJobData,
  type ScriptingJobData,
  type GenerationJobData,
  type QCJobData,
  type AssemblyJobData,
  type DeliveryJobData,
} from "./queue/setup.js";

// Workers
export { startAllWorkers } from "./queue/workers.js";

// Stages (for direct invocation/testing)
export { processIntake } from "./stages/intake.js";
export { processAnalysis } from "./stages/analyze.js";
export { processScripting } from "./stages/script.js";
export { processGeneration } from "./stages/generate.js";
export { processQC } from "./stages/qc.js";
export { processAssembly } from "./stages/assemble.js";

// Providers
export { selectProvider, getEnabledProviders } from "./providers/router.js";
export type { IVideoProvider } from "./providers/provider.interface.js";

// Utilities
export { estimateGenerationCost, formatCostCents } from "./utils/cost-tracker.js";
