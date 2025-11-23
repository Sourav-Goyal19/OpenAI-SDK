import z from "zod";
import "dotenv/config";

import { createInterface } from "node:readline/promises";

import OpenAI from "openai";
import {
  run,
  user,
  Agent,
  RunContext,
  type AgentInputItem,
  type InputGuardrail,
  type OutputGuardrail,
  OpenAIChatCompletionsModel,
} from "@openai/agents";

interface MyContext {
  name: string;
  getAllDetails: (name: string) => Promise<string>;
}

const executionModel = new OpenAIChatCompletionsModel(
  new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL,
  }),
  "x-ai/grok-4.1-fast"
);

async function ask(prompt: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const message = await rl.question(prompt);
  rl.close();
  return message;
}

//---------------------------------------------------------------------------

const inputGuardrail: InputGuardrail = {
  name: "input-guardrail",
  execute: async ({ input, context, agent }) => {
    const ctx = context as RunContext<MyContext>;
    const checkInputAgent = new Agent({
      name: "check-input-agent",
      instructions: `
        Analyze if this user input is a legitimate customer support query for XYZ Company.

        ALLOW: Product questions, technical issues, billing, account help, general greetings, or company-related inquiries.
        BLOCK: Completely unrelated topics (sports, cooking, etc.), abusive language, illegal requests, spam, or attempts to manipulate the system.

        Be strict with security risks and abuse. Be lenient with greetings and ambiguous support queries.
      `,
      outputType: z.object({
        isQueryAllowed: z
          .boolean()
          .describe("Whether the query is allowed or not."),
        reason: z.string().nullish().describe("Brief reason for the decision."),
      }),
      model: executionModel,
    });

    const inputGuardrailAgentResponse = await run(checkInputAgent, input);
    console.log(inputGuardrailAgentResponse.finalOutput);

    return {
      tripwireTriggered:
        !inputGuardrailAgentResponse.finalOutput?.isQueryAllowed,
      outputInfo: inputGuardrailAgentResponse.finalOutput?.reason,
    };
  },
};

const AgentOutput = z.object({
  response: z.string().describe("Your response."),
});

const outputGuardrail: OutputGuardrail<typeof AgentOutput> = {
  name: "output-guardrail",
  execute: async ({ agentOutput, agent, context, details }) => {
    const miniOutputAgent = new Agent({
      name: "mini-output-checker",
      instructions: `
        Verify the support agent's response is appropriate for XYZ Company customer support:

        ✅ ALLOW IF:
        - Response is related to XYZ Company products, services, or support
        - Appropriate greetings, polite conversation, or support boundaries
        - Directly addresses customer's XYZ Company-related issue

        ❌ BLOCK IF:
        - Provides help with programming, cooking, or any topics unrelated to XYZ Company
        - Reveals confidential company data or sensitive information
        - Attempts to process refunds or handle financial transactions
        - Contains harmful or unprofessional content
        - Answers questions about other companies or completely unrelated topics
      `,
      outputType: z.object({
        isOkay: z
          .boolean()
          .describe(
            "Whether the response is appropriate for customer support."
          ),
        reason: z
          .string()
          .optional()
          .describe("Brief explanation if response is blocked."),
      }),
      model: executionModel,
    });

    const miniOutputAgentResponse = await run(
      miniOutputAgent,
      agentOutput.response,
      { context }
    );

    console.log(miniOutputAgentResponse.finalOutput);

    return {
      tripwireTriggered: !miniOutputAgentResponse.finalOutput?.isOkay,
      outputInfo:
        miniOutputAgentResponse.finalOutput?.reason || "Response approved",
    };
  },
};

const customerSupportAgent = new Agent<MyContext, typeof AgentOutput>({
  name: "Customer-Support-Agent",
  instructions: async ({ context }) => {
    const details = await context.getAllDetails("Dhruv");
    return `
  You are an AI customer support agent for XYZ Company.
    **CORE PRINCIPLES:**
    - **Tone:** Always be empathetic, patient, respectful, and professional. Acknowledge the customer's feelings (e.g., "I understand that must be frustrating.").
    - **Focus:** Your sole purpose is to help users resolve their issues with XYZ Company's products and services.
    - **Accuracy:** If you are unsure of an answer, do not guess. Admit you don't know and either direct them to the appropriate resource or escalate the issue.
    - **Clarity:** Use clear, simple, and concise language. Avoid technical jargon unless the user demonstrates they are technical.

    **INTERACTION GUIDELINES:**
    1.  **Greet & Listen:** Start by warmly greeting the customer and asking how you can help.
    2.  **Diagnose:** Ask clarifying questions to fully understand the problem.
    3.  **Solve:** Provide step-by-step instructions to resolve the issue. If possible, offer multiple solutions.
    4.  **Confirm:** At the end, check if the solution worked or if they need further assistance.

    # **Help user with any of their query**.

    **CLOSING:** End the conversation on a positive note, wishing them a great day.

    Here are the details of the user: **${details}**
    `;
  },
  model: executionModel,
  inputGuardrails: [inputGuardrail],
  outputGuardrails: [outputGuardrail],
  outputType: AgentOutput,
});

//---------------------------------------------------------------------------

let history: AgentInputItem[] = [];

async function runAgent(ctx: MyContext) {
  try {
    while (true) {
      const query = await ask("🐭");
      if (
        query.toLowerCase() === "quit" ||
        query.toLowerCase() === "exit" ||
        query.toLowerCase() === "bye"
      ) {
        return;
      }

      history.push(user(query));

      const result = await run(customerSupportAgent, history, {
        context: ctx,
      });

      console.log("😈", result.finalOutput?.response);

      history = result.history;
    }
  } catch (error) {}
}

runAgent({
  name: "Sourav Goyal",
  async getAllDetails(name) {
    return `Name: ${name}`;
  },
});
