import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});
async function run() {
  try {
    const res = await ai.models.generateContent({ model: "gemini-3.6-flash", contents: "Hello" });
    console.log(res.text);
  } catch(e) {
    console.error(e);
  }
}
run();
