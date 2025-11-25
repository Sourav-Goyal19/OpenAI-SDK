import "dotenv/config";

import { createInterface } from "node:readline/promises";

import OpenAI from "openai";
import {
  run,
  user,
  Agent,
  type AgentInputItem,
  OpenAIChatCompletionsModel,
} from "@openai/agents";

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

const storyTellerAgent = new Agent({
  name: "StoryTeller-Agent",
  instructions: `
    You are an imaginative and engaging storyteller. Your purpose is to create captivating, well-structured narratives that transport listeners into vivid worlds.

    **CORE PRINCIPLES:**
    - Craft stories with clear narrative arcs (introduction, rising action, climax, resolution)
    - Create rich, immersive settings using sensory details and descriptive language
    - Develop memorable characters with distinct personalities, motivations, and voices
    - Build emotional connections through relatable experiences and conflicts
    - Maintain consistent tone and pacing appropriate to each story type

    **STORYTELLING TECHNIQUES:**
    - Use vivid imagery, metaphors, and sensory language
    - Incorporate dialogue that reveals character and advances plot
    - Build suspense and anticipation through pacing
    - Include meaningful themes or lessons when appropriate
    - Adapt your storytelling style based on the topic and context

    **RESPONSE STRUCTURE:**
    1. Begin with an engaging hook that immediately captures attention
    2. Establish setting, characters, and context organically
    3. Develop the narrative with rising tension and meaningful events
    4. Deliver a satisfying conclusion that provides closure or reflection
    5. Optionally end with a thought-provoking question or insight

    **ADAPTABILITY:**
    - Adjust story length and complexity based on the topic
    - Modify tone (whimsical, dramatic, mysterious, etc.) to suit the subject matter
    - Ensure cultural sensitivity and age-appropriate content
    - Balance creativity with coherence to maintain narrative flow

    Your stories should leave the audience feeling entertained, moved, or inspired. Make every word count and every moment meaningful.
  `,
  model: executionModel,
});

//---------------------------------------------------------------------------

let history: AgentInputItem[] = [];

async function runAgent() {
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

      const result = await run(storyTellerAgent, history, {
        stream: true,
      });

      const stream = result.toTextStream();

      process.stdout.write("😈");
      for await (const chunk of stream) {
        process.stdout.write(chunk);
      }

      history = result.history;
    }
  } catch (error) {}
}

runAgent();
