const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const UserMemoryProfile = require('../models/UserMemoryProfile');
const { protect } = require('../middleware/authMiddleware');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/assistant/report/analyze
 * Analyzes a base64 encoded medical report image using GPT-4o Vision.
 * Extracts vitals and diagnoses, and updates the user's permanent memory profile.
 */
router.post('/analyze', protect, async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const userId = req.user._id;

    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert medical AI assistant. Extract key health data from the provided medical report. Return ONLY a JSON object with the following structure: { \"diagnoses\": [\"condition1\", \"condition2\"], \"vitals\": { \"metric_name\": \"value\" }, \"summary\": \"brief summary\" }. Do not include markdown formatting or backticks around the JSON."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Please analyze this medical report and extract the conditions and vitals." },
            { type: "image_url", image_url: { url: imageBase64 } }
          ]
        }
      ],
      max_tokens: 500,
    });

    let rawOutput = response.choices[0].message.content.trim();
    // Strip markdown if GPT accidentally includes it
    if (rawOutput.startsWith('```json')) {
      rawOutput = rawOutput.replace(/```json\n?/, '').replace(/```\n?$/, '');
    }

    const extractedData = JSON.parse(rawOutput);

    // Update UserMemoryProfile with extracted diagnoses
    if (extractedData.diagnoses && extractedData.diagnoses.length > 0) {
      const profile = await UserMemoryProfile.getOrCreate(userId.toString());
      let changed = false;

      for (const condition of extractedData.diagnoses) {
        const existing = profile.healthConditions.find(c => c.name.toLowerCase() === condition.toLowerCase());
        if (existing) {
          existing.mentionCount += 1;
          existing.lastMentioned = new Date();
        } else {
          profile.healthConditions.push({
            name: condition,
            firstMentioned: new Date(),
            lastMentioned: new Date(),
            mentionCount: 1,
            confirmed: true, // Confirmed because it's from a medical report
          });
        }
        changed = true;
      }

      if (changed) {
        profile.lastInteraction = new Date();
        await profile.save();
      }
    }

    res.json({
      success: true,
      data: extractedData,
      message: 'Report analyzed and memory updated successfully.'
    });

  } catch (error) {
    console.error('[AssistantReport] Error analyzing report:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze report' });
  }
});

module.exports = router;
