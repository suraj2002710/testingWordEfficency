const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const axios = require("axios");
const dotenv = require("dotenv");
const fs = require("fs");

dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Function to analyze answers using OpenRouter GPT-4o
async function analyzeAnswers(questionsText, answersText) {
  const prompt = `
You are an expert exam evaluator. Compare the student's answers with the questions and correct answers.
Each question includes marks in brackets (e.g., "(3 marks)"). Use those marks for scoring.

**Instructions:**
1. Use the marks mentioned in the questions file.
2. Give full marks if the answer is fully correct.
3. Give **partial marks** if the answer is partially correct.
4. At the end, provide total marks and percentage.
5. Respond **only** in strict JSON format.

Questions with Correct Answers and Marks:
${questionsText}

Student's Answers:
${answersText}

Respond in this strict JSON  structure:
{
   "totalMarks": <number>,
  "obtainedMarks": <number>,
  "percentage": "<xx.xx>%"
}
`;

  const response = await axios.post(
    OPENROUTER_URL,
    {
      model: "google/gemma-3-27b-it:free",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer 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`,
        "Content-Type": "application/json",
      },
    }
  );
  
  
  let rawText =
  response.data.choices?.[0]?.message?.content || "{}";
  console.log(rawText,"rawText");

  // Remove unwanted markdown or text if GPT returns anything extra
  rawText = rawText
    .replace(/[\u2705\u2713]/g, "")               // remove ✅ or ✔️ emojis
    .replace(/\\n/g, "")                           // remove newlines inside JSON string
    .replace(/\\"/g, '"')                          // handle escaped quotes
    .replace(/'/g, "\\'")                          // escape single quotes inside text
    // .replace(/,\s*([}\]])/g, "$1")
    .replace(/json\s*/g, "").replace(/```/g, "")
    .trim();

  // Safely parse JSON
  try {
    return JSON.parse(rawText);
    // return rawText
  } catch (err) {
    console.error("Invalid JSON:", err);
    throw new Error("Invalid JSON response from AI");
  }
}

app.post(
  "/check-answers",
  upload.fields([{ name: "questions" }, { name: "answers" }]),
  async (req, res) => {
    try {
      // Extract text from uploaded Word files
      const questions = (
        await mammoth.extractRawText({ path: req.files.questions[0].path })
      ).value;

      const answers = (
        await mammoth.convertToHtml({ path: req.files.answers[0].path })
      ).value;

    //   console.log(questions,answers)
      // Send texts to GPT-4o via OpenRouter
      const result = await analyzeAnswers(questions, answers);


      res.json({
        success: true,
        result,
        questions,
        answers
      });

      // Cleanup uploaded files
      fs.unlinkSync(req.files.questions[0].path);
      fs.unlinkSync(req.files.answers[0].path);
    } catch (error) {
      console.error(error.response?.data || error.message);
      res.status(500).json({ error: "Failed to analyze answers" });
    }
  }
);

app.listen(5000, () =>
  console.log("🚀 Server running on http://localhost:5000")
);

