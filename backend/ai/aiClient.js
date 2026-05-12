const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildClaimValidationPrompt } = require('./prompts');
const { runMockClaimValidation } = require('./mockAI');

const parseJsonResponse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
};

const runAIClaimValidation = async ({ claim, documents }) => {
  const provider = process.env.AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? 'openrouter' : 'mock');
  const prompt = buildClaimValidationPrompt(claim, documents);

  if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
    const openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:4028',
        'X-Title': 'InsureFlow AI',
      },
    });
    const response = await openrouter.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    return parseJsonResponse(response.choices[0].message.content) || runMockClaimValidation({ claim, documents });
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    return parseJsonResponse(response.choices[0].message.content) || runMockClaimValidation({ claim, documents });
  }

  if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return parseJsonResponse(result.response.text()) || runMockClaimValidation({ claim, documents });
  }

  return runMockClaimValidation({ claim, documents });
};

module.exports = { runAIClaimValidation };
