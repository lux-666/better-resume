import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";

export function runtime(calls: Array<[string, object]>) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(calls.map(([name, value]) => fauxAssistantMessage(fauxToolCall(name, value), { stopReason: "toolUse" })));
  return { model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
}
