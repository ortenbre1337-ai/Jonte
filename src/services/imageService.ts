import { GoogleGenAI } from "@google/genai";

export async function generateCardArt(cardName: string, cardType: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `A high-quality fantasy card game illustration of a character named "${cardName}". 
    The character is a ${cardType} game unit. 
    Style: Epic fantasy, detailed digital art, magical atmosphere, vibrant colors. 
    Focus on the character, no text, clean background.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "3:4",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
}
