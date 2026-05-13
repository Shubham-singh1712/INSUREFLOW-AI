import { NextResponse } from 'next/server';
// @ts-ignore
import pdfParse from 'pdf-parse';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = '';
    try {
      const data = await pdfParse(buffer);
      text = data.text;
    } catch (e) {
      console.error('PDF Parse Error:', e);
      return NextResponse.json({ error: 'Failed to extract text from PDF' }, { status: 500 });
    }

    if (!text || text.trim().length === 0) {
      text = "Empty or scanned PDF. No embedded text found.";
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not defined in environment");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an AI specialized in medical claims processing. Extract information from the provided text into a JSON array matching exactly this format:
[
  { "id": "patientName", "label": "Patient name", "value": "Name", "confidence": 98, "source": "Page 1" },
  { "id": "insuranceNumber", "label": "Insurance number", "value": "...", "confidence": 95, "source": "Page 1" },
  { "id": "diagnosis", "label": "Diagnosis", "value": "...", "confidence": 90, "source": "Page 2" },
  { "id": "doctorName", "label": "Attending physician", "value": "...", "confidence": 92, "source": "Page 3" },
  { "id": "hospital", "label": "Hospital / Facility", "value": "...", "confidence": 96, "source": "Page 1" },
  { "id": "procedure", "label": "Procedure", "value": "...", "confidence": 85, "source": "Page 3" },
  { "id": "invoiceTotal", "label": "Invoice total", "value": "...", "confidence": 89, "source": "Page 4" },
  { "id": "claimType", "label": "Claim metadata", "value": "...", "confidence": 90, "source": "AI inference" }
]
Use "Not found" for missing values. confidence should be 1-100.
Return ONLY the raw JSON array. Do not include markdown code block syntax (\`\`\`json). Do not include any other text.`
          },
          {
            role: "user",
            content: `Here is the extracted text from the document:\n\n${text.substring(0, 15000)}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const aiData = await response.json();
    let fields = [];
    try {
      let content = aiData.choices[0].message.content.trim();
      if (content.startsWith('```json')) content = content.replace(/```json/g, '').replace(/```/g, '').trim();
      if (content.startsWith('```')) content = content.replace(/```/g, '').trim();
      fields = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", aiData.choices[0]?.message?.content);
      throw new Error("Failed to parse structured data from AI");
    }

    return NextResponse.json({ fields });

  } catch (error: any) {
    console.error('Extraction Error:', error);
    return NextResponse.json({ error: error.message || 'Unknown error during extraction' }, { status: 500 });
  }
}
