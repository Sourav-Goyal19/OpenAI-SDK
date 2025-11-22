import z from "zod";
import "dotenv/config";
import OpenAI from "openai";
import fs from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import {
  run,
  user,
  tool,
  Agent,
  withTrace,
  type AgentInputItem,
  OpenAIChatCompletionsModel,
} from "@openai/agents";

const executionModel = new OpenAIChatCompletionsModel(
  new OpenAI({
    baseURL: process.env.OPENROUTER_BASE_URL,
    apiKey: process.env.OPENROUTER_API_KEY,
  }),
  "openai/gpt-4.1-mini"
);

async function ask(prompt: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const message = await rl.question(prompt);
  rl.close();
  return message;
}

const fetchAvailablePlansTool = tool({
  name: "fetch_available_plans",
  description: "Fetches the available broadband plans for a user.",
  parameters: z.object({}),
  execute: async () => {
    return [
      { plan_id: "1", price_inr: "399", speed: "30 MB/s" },
      { plan_id: "2", price_inr: "999", speed: "100 MB/s" },
      { plan_id: "3", price_inr: "1499", speed: "150 MB/s" },
    ];
  },
});

const processRefundTool = tool({
  name: "process_refunds",
  description: "Process a refund request for a customer.",
  parameters: z.object({
    customerId: z.string().describe("The customer ID for the refund."),
    reason: z.string().describe("Reason for the refund request."),
  }),
  execute: async ({ customerId, reason }) => {
    await fs.appendFile(
      "./refunds.txt",
      `Refund initiated for CustomerID: ${customerId} because: ${reason}\n`,
      "utf-8"
    );
    return "Refund has been successfully processed.";
  },
});

const refundAgent = new Agent({
  name: "Refund Specialist",
  instructions: `You are a refund expert who handles customer refund requests for broadband services. Your role is to understand the reason for a refund and process it efficiently.`,
  tools: [processRefundTool],
  model: executionModel,
});

const salesAgent = new Agent({
  name: "Sales Advisor",
  instructions: `You are a friendly and knowledgeable sales advisor for an internet broadband company. Your job is to help customers by providing information about available broadband plans and assisting with refunds when needed. Ask user anything whenever you think that you should to collect some required information.`,
  tools: [
    fetchAvailablePlansTool,
    refundAgent.asTool({
      toolName: "refund_expert",
      toolDescription: "Handles refund requests for broadband customers.",
    }),
  ],
  model: executionModel,
});

let history: AgentInputItem[] = [];

async function main() {
  await withTrace("Broadband-Agent-Session", async () => {
    while (true) {
      const query = await ask("️➡️➡️");

      if (
        query.toLowerCase() === "quit" ||
        query.toLowerCase() === "exit" ||
        query.toLowerCase() === "bye"
      ) {
        return;
      }

      history.push(user(query));

      const result = await run(salesAgent, history);
      console.log("🧠🧠", result.finalOutput);

      history = result.history;
    }
  });
}

main();
