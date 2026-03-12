import { GoogleGenAI } from '@google/genai';

export const handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Empty request body' })
      };
    }

    const { prompt, image, aspectRatio } = JSON.parse(event.body);

    if (!prompt || !image) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing prompt or image' })
      };
    }

    // Initialize Gemini API with the environment variable
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const base64Data = image.split(',')[1];
    const mimeType = image.split(';')[0].split(':')[1];

    // Generate a random seed for this specific request
    const seed = Math.floor(Math.random() * 4294967295);
    const promptWithSeed = `${prompt}\n\n[seed:${seed}]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        {
          parts: [
            { text: promptWithSeed },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        imageConfig: {
          aspectRatio: aspectRatio || '9:16',
        }
      }
    });

    const candidate = response.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(p => p.inlineData);
    
    if (imagePart && imagePart.inlineData && imagePart.inlineData.data) {
      const imageUrl = `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`;
      return {
        statusCode: 200,
        body: JSON.stringify({ url: imageUrl })
      };
    } else {
      const textPart = candidate?.content?.parts?.find(p => p.text);
      throw new Error(textPart?.text || 'No image data returned');
    }

  } catch (error) {
    console.error("Generation error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
