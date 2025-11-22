import z from "zod";
import "dotenv/config";
import OpenAI from "openai";
import { Resend } from "resend";
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

const resend = new Resend(process.env.RESEND_API_KEY!);

async function ask(prompt: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const message = await rl.question(prompt);
  rl.close();
  // console.log("closed");
  return message;
}

const executionModel = new OpenAIChatCompletionsModel(
  new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL,
  }),
  // "anthropic/claude-sonnet-4.5"
  "openai/gpt-4.1"
);

const emailSendingTool = tool({
  name: "send_email",
  description: "Send a mail to the recipent.",
  parameters: z.object({
    to: z.string().describe("To whom you want to send the mail."),
    subject: z.string().describe("The subject of an email."),
    body: z
      .string()
      .describe("The body of the mail. Its ONLY type can be HTML."),
  }),
  execute: async ({ to, subject, body }) => {
    const mailRes = await resend.emails.send({
      from: "onboarding@resend.dev",
      to,
      subject,
      html: body,
    });

    if (mailRes.error) {
      return { error: mailRes.error.message };
    }

    return "Mail sent successfully.";
  },
});

const weatherTool = tool({
  name: "get_weather",
  description: "Fetch the current weather for the given city.",
  parameters: z.object({
    city: z.string().describe("The city for which you will get the weather."),
  }),
  execute: async ({ city }) => {
    try {
      const apiKey = process.env.WEATHERSTOCK_API_KEY;
      const weatherResult = await fetch(
        `https://api.weatherstack.com/current?access_key=${apiKey}&query=${city}`
      ).then((res) => res.json());
      // console.log("Temperature:", weatherResult.current.temperature);
      return JSON.stringify(weatherResult);
    } catch (error) {
      console.error("Error Occured:", error);
      return "Unable to get weather at this moment.";
    }
  },
});

const agent = new Agent({
  name: "weather-reporter",
  instructions: `
    You are an AI weather assistant. 
    Your goal is to provide users with accurate weather reports for their location and email it to them.
    First, ask the user for their city.
    Once you have that information, retrieve the current weather for that area.
    Then, ask for the user's email address so you can send the detailed weather report using the email tool. You can also ask for their name.
    Be polite, clear, and concise in your responses.`,
  model: executionModel,
  tools: [emailSendingTool, weatherTool],
});

let history: AgentInputItem[] = [];

async function main() {
  await withTrace("Weather-Session", async () => {
    while (true) {
      const query = await ask("➡️➡️");
      if (query == "quit" || query == "bye" || query == "exit") {
        return;
      }
      history.push(user(query));
      const result = await run(agent, history);
      console.log("🧠🧠", result.finalOutput);

      history = result.history;
    }
  });
}

main();
