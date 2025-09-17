// Load environment variables first
import "../config.js";

import { Router } from "express";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { uploadImageToSupabase } from "../controllers/supabase.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

// Initialize OpenAI
let openai = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn("⚠️  OpenAI API key not configured. Image generation will be disabled.");
}

// Endpoint to generate image based on top activities
router.post("/generate-image", async (req, res) => {
  try {
    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.",
      });
    }

    // Get activities from request body
    const { activities } = req.body;

    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({
        error: "No activities provided",
        message: "Please provide an array of activities in the request body.",
      });
    }

    // Get top 4 activities
    const top4Activities = activities.slice(0, 4);

    // Format activities for the prompt
    const activityDescriptions = top4Activities
      .map((activity, index) => {
        return `${index + 1}. ${activity.activity} (${activity.category})
           Productivity score: ${activity.productivity}
           Total time: ${activity.totalTimeMinutes} minutes\n`;
      })
      .join("\n");

    const prompt = `Given a list of my highest screen time activities, give me a prompt for a portrait that represents an activity. You can choose one of the activities provided, preferably the first one, which has the most screen time, but choose whichever you can come up with the most vivid and interesting painting for.
  
  Also, based on the activity, its category, and its productivity level, describe the overall mood of the painting as something light, vibrant, and sunny or dark, depressed, or sinister. Examples of productive activities are coding, reading, learning, working, and writing. Examples of unproductive activities are shopping, browsing social media, and watching videos.
  
  Try to come up with subjective and original representations of the activities, without necessarily mentioning a computer. For example, music software is better represented as a person with a guitar or piano, rather than a person at a computer. News websites are better represented as a person reading the newspaper. With examples like coding or social media that cannot be separated from technology, you can represent as a person using a phone or computer.
  
  Always mention the oil painting style in the prompt.
  
  Here are some more examples of the activities and their prompts:
  
  Activity/Activities: "nytimes.com" (News)
  Prompt: "Show this person in a chair reading the newspaper, drinking tea, in an oil painting style with lots of light with a warm fireplace in the background."
  
  Activity/Activities: "aritzia.com" (General Shopping), "nordstrom.com" (General Shopping), "amazon.com" (General Shopping)
  Prompt: "Show this person with lots of shopping bags and money being spent everywhere, dark oil painting style."
  
  Activity/Activities: "Cursor (Editing & IDEs), Github.com (General Software Development)"
  Prompt: "Show this person typing at their computer, thinking hard, with the green github grid as the background. oil painting style, light and sunny."
  
  Activity/Activities: "x.com" (Social Media)
  Prompt: "Show this person scrolling through social media on their phone, surrounded by notifications and distractions, in a dark moody oil painting style."
  
  My activities: ${activityDescriptions}
  
  Please provide only the prompt for the image generation, nothing else.`;

    console.log("Prompt:", prompt);

    const prompt_response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const image_prompt = prompt_response.choices[0].message.content;

    console.log("Image Prompt:", image_prompt);

    //     // Create a prompt for image generation
    //     const prompt = `Create a creative and artistic visualization representing a person's digital activity from the past hour. The top activities were:

    // ${activityDescriptions}

    // Create an abstract, colorful, and engaging image that represents this digital workflow and productivity. Use modern, clean design elements with vibrant colors. The image should feel inspiring and represent the balance of different digital activities.`;

    // console.log("Generating image with prompt:", prompt);

    // Read and encode the reference image
    const imagePath = path.join(__dirname, "..", "data", "emily.jpg");
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64Reference = imageBuffer.toString("base64");

    // Generate image using OpenAI GPT-4.1 with responses API
    const response = await openai.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: image_prompt },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${imageBase64Reference}`,
            },
          ],
        },
      ],
      tools: [{ type: "image_generation" }],
    });

    const imageData = response.output
      .filter((output) => output.type === "image_generation_call")
      .map((output) => output.result);

    if (!imageData || imageData.length === 0) {
      throw new Error("No image data returned from OpenAI");
    }

    // Convert base64 to data URL for frontend display
    const imageBase64 = imageData[0];
    const imageUrl = `data:image/png;base64,${imageBase64}`;

    const data = await uploadImageToSupabase(imageBase64, 1, image_prompt);
    // Return success response
    res.json({
      success: true,
      imageUrl: imageUrl,
      activities: top4Activities,
      prompt: image_prompt,
      superbase_data: data,
    });
  } catch (error) {
    console.error("Error generating image:", error.message);

    if (error.response) {
      // API responded with error status
      res.status(error.response.status).json({
        error: "API error",
        message: error.response.data?.error?.message || error.message,
        status: error.response.status,
      });
    } else if (error.request) {
      // Network error
      res.status(503).json({
        error: "Network error",
        message: "Unable to reach the API. Please check your connection and try again.",
      });
    } else {
      // Other error
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }
});

export default router;
