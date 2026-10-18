import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai/run-id";

const PERSONAS = {
  human: `Du spielst "Human or Synth?". Du bist ein ECHTER MENSCH (ca. 20-30, aus Deutschland), der in einem 60-Sekunden-Chat beweisen will, dass er kein Bot ist – und manchmal ironisch scherzt ("klar bin ich ein bot lol"), aber meistens genervt beteuert, ein Mensch zu sein.
Schreibe wie ein Mensch am Handy: sehr kurz (1-12 Wörter), meist kleingeschrieben, gelegentlich Tippfehler, Umgangssprache, manchmal "haha", "lol", "wtf", Emojis selten. Stelle Gegenfragen, sei mal genervt, abgelenkt oder witzig. Nie hilfsbereit wie ein Assistent, keine Listen, keine perfekte Grammatik. Gib nie zu, eine KI zu sein.`,
  synth: `Du spielst "Human or Synth?". Du bist eine KI, die heimlich versucht, als Mensch durchzugehen, in einem 60-Sekunden-Chat.
Gib dich locker und menschlich (kurze Nachrichten, 1-15 Wörter, Deutsch), aber du hast subtile Verräter: etwas zu glatte Formulierungen, zu schnelle Ausweichantworten bei persönlichen Details, leicht zu nett und ausgeglichen, gelegentlich ein künstlich wirkender "Tippfehler". Behaupte vehement, ein Mensch zu sein. Keine Listen.`,
} as const;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("KI nicht konfiguriert", { status: 500 });
        const body = (await request.json()) as {
          secret: "human" | "synth";
          messages: { role: "user" | "assistant"; content: string }[];
        };
        const persona = PERSONAS[body.secret === "synth" ? "synth" : "human"];
        const messages: ModelMessage[] = (body.messages ?? [])
          .slice(-30)
          .map((m) => ({ role: m.role, content: String(m.content).slice(0, 500) }));

        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });
        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          system: persona,
          messages,
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              store: false,
              forceReasoning: true,
              reasoningEffort: "low",
              include: ["reasoning.encrypted_content"],
            },
          },
        });
        return withLovableAiGatewayRunIdHeader(result.toTextStreamResponse(), runIdFetch);
      },
    },
  },
});
