   require('dotenv').config();
   const { GoogleGenAI } = require('@google/genai');
   const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim().replace(/^["']|["']$/g, '') });
   (async () => {
     const lista = await ai.models.list();
     for await (const m of lista) console.log(m.name);
   })();