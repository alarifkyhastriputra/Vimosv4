import { GoogleGenAI, ThinkingLevel } from "@google/genai";
const ai = new GoogleGenAI({});
async function run() {
  try {
    const res = await ai.models.generateContent({ 
        model: "gemini-3.6-flash", 
        contents: "Hello",
        config: {
            thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW
            }
        }
    });
    console.log(res.text);
  } catch(e) {
    console.error(e);
  }
}
run();
