import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import type { TelemetryCollector, TelemetrySpan } from "./telemetry.ts";
type AgentOptions = ConstructorParameters<typeof Agent>[0];
const observations = new WeakMap<Agent, { collector: TelemetryCollector; span: TelemetrySpan; unsubscribe: () => void }>();
export function createObservedAgent(options: {
  model: NonNullable<AgentOptions["initialState"]>["model"]; streamFn: AgentOptions["streamFn"];
  tools: AgentTool[]; prompt: string; operation: string; telemetry?: TelemetryCollector; attempt?: number;
}): Agent {
  const span = options.telemetry?.start(options.operation, "agent", undefined, { attempt: options.attempt ?? 1, retryCount: (options.attempt ?? 1) - 1 });
  const agent = new Agent({ initialState: { systemPrompt: options.prompt, model: options.model, tools: options.tools },
    streamFn: options.telemetry && span ? options.telemetry.instrumentStreamFn(options.streamFn, span.spanId) : options.streamFn,
    toolExecution: "sequential" });
  if (options.telemetry && span) {
    const collector = options.telemetry;
    observations.set(agent, { collector, span, unsubscribe: agent.subscribe((event) => collector.recordAgentEvent(event, span.spanId)) });
  }
  return agent;
}
export async function runObservedAgent<T>(agent: Agent, input: string, accepted: () => T, signal?: AbortSignal): Promise<T> {
  const observation = observations.get(agent);
  let rejectAbort: ((error: unknown) => void) | undefined;
  const abort = () => { agent.abort(); rejectAbort?.(signal?.reason ?? new Error("Execution aborted")); };
  try {
    signal?.throwIfAborted();
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    signal?.addEventListener("abort", abort, { once: true });
    await Promise.race([agent.prompt(input), aborted]);
    signal?.throwIfAborted();
    const result = accepted();
    if (observation) observation.collector.finish(observation.span);
    return result;
  } catch (error) {
    if (observation) {
      observation.collector.error(observation.span, signal?.aborted ? "aborted" : "runtime_error", error);
      observation.collector.finish(observation.span);
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    observation?.unsubscribe();
    observations.delete(agent);
  }
}
