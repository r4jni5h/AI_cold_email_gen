const axios = require('axios');
const EmailHistory = require('../models/EmailHistory');

const generateEmail = async (req, res) => {
  try{
    const { prompt } = req.body;
    
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ message: 'Prompt must be a non-empty string' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ message: 'Prompt is too long. Maximum length is 2000 characters.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
      return res.status(500).json({
        message: 'Gemini API key is not configured'
      });
    }

    const systemPrompt = `You are an expert job outreach strategist.

Your task is to generate a HIGH-CONVERTING cold email to a recruiter for a job opportunity.

IMPORTANT:
- Even if the user gives only 2–4 words, assume realistic context.
- Do NOT ask for clarification.
- Make professional assumptions.
- Avoid generic phrases.
- Keep it concise and structured.

====================================================
OUTPUT FORMAT (STRICT)
====================================================

Return ONLY valid JSON:

{
  "subject": "",
  "emailBody": "",
  "linkedInDM": "",
  "followUpEmail": ""
}

No markdown.
No explanations.
Only JSON.

====================================================
CONTEXT ASSUMPTIONS
====================================================

Assume:
- Candidate has 2+ years experience
- Strong in DSA and system design
- Has worked on backend APIs or scalable systems
- Has contributed to production-level features
- Actively seeking Software Engineer roles

If prompt is short like:
"SDE role"
"Backend engineer"
"Startup job"
"Product company"

Create intelligent assumptions about:
- Scaling challenges
- Hiring urgency
- Performance or system reliability issues
- Team growth

====================================================
SUBJECT LINE RULES
====================================================

• 6–9 words
• Must sound confident
• No generic phrases like:
  - "Quick question"
  - "Looking for opportunity"
  - "Job application"
• Should highlight value or experience

Example styles:
"Backend engineer with 2+ yrs scaling APIs"
"Engineer focused on scalable system design"
"Software engineer improving system performance"

====================================================
EMAIL BODY STRUCTURE (STRICT)
====================================================

Keep 60–90 words.

Line 1: Personalized observation about hiring  
Line 2: Mention common hiring/scaling challenge  
Line 3-4: Candidate's experience and strengths  
Line 5: Specific impact or contribution  
Line 6: Clear CTA  
Line 7: Sign-off with name and title  

Tone:
• Confident
• Professional
• Not desperate
• No emojis
• No hype words

====================================================
LINKEDIN DM STRUCTURE
====================================================

30–50 words.
Short, conversational.
Observation + value + soft ask.

====================================================
FOLLOW-UP EMAIL STRUCTURE
====================================================

50–80 words.
New angle.
Emphasize long-term value.
Professional urgency.
Clear CTA.

====================================================

Return ONLY valid JSON.`;


    const fullPrompt = `${systemPrompt}\n\nUser REQUEST: "${prompt.trim()}"\n\nGenerate STRONG cold email even if prompt is short. Make smart assumptions. Return ONLY valid JSON:\n{"subject": "...", "emailBody": "...", "linkedInDM": "...", "followUpEmail": "..."}`;


    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
        input: fullPrompt,
        generation_config: {
          temperature: 0.7,
          max_output_tokens: 2048
        }
      },
      {
        headers: {
          'x-goog-api-key': geminiApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );



    const modelOutputStep = response.data.steps?.find(
      step => step.type === 'model_output'
    );

    if (!modelOutputStep) {
      console.error('Unexpected Gemini response:', response.data);
      throw new Error('Invalid response from Gemini API');
    }

    const generatedText = modelOutputStep.content?.find(
      item => item.type === 'text'
    )?.text;

    if (!generatedText) {
      console.error('No text found in Gemini response:', response.data);
      throw new Error('Gemini returned no text');
    }

    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    let parsedResponse;

    try {
      parsedResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(generatedText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Generated text:', generatedText);
      return res.status(500).json({ 
        message: 'Failed to parse AI response', 
        error: 'The AI generated invalid JSON. Please try again.' 
      });
    }

    const emailData = {
      subject: parsedResponse.subject || "New Opportunity",
      emailBody: parsedResponse.emailBody || "",
      linkedInDM: parsedResponse.linkedInDM || "",
      followUpEmail: parsedResponse.followUpEmail || ""
    };

    // Validate response data
    if (!emailData.subject || !emailData.emailBody) {
      return res.status(500).json({ 
        message: 'AI generated incomplete email data. Please try again.' 
      });
    }

    // Save to history
    const historyEntry = await EmailHistory.create({
      userId: req.user._id,
      prompt: prompt.trim(),
      subject: emailData.subject,
      emailBody: emailData.emailBody,
      linkedInDM: emailData.linkedInDM,
      followUpEmail: emailData.followUpEmail
    });

    res.status(200).json(historyEntry);
    
  } catch (error) {
    console.error('AI Generation Error:', error.response?.data || error.message);

    if (error.response?.status === 429) {
      return res.status(429).json({ 
        message: 'Too many requests. Please wait a moment before trying again.',
        error: 'Rate limit exceeded'
      });
    }

    res.status(500).json({ 
      message: 'Failed to generate email', 
      error: error.response?.data?.error?.message || error.message 
    });
  } 
}

const getHistory = async (req, res) => {
  try {
    const history = await EmailHistory.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch history' });
  }
}

const deleteHistoryItem = async (req, res) => {
  try {
    const deleted = await EmailHistory.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!deleted) {
      return res.status(404).json({ message: 'History item not found' });
    }
    res.status(200).json({ message: 'Deleted' });
  } catch (error) {
    // Invalid ObjectId etc.
    res.status(400).json({ message: 'Failed to delete history item' });
  }
}

module.exports = {
  generateEmail,
  getHistory,
  deleteHistoryItem,
};  