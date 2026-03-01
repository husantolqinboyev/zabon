const axios = require('axios');
const config = require("../config");

class GeminiService {
    constructor() {
        if (!config.OPENROUTER_API_KEY) {
            console.error("OPENROUTER_API_KEY topilmadi!");
            return;
        }
        this.apiKey = config.OPENROUTER_API_KEY;
        this.modelName = config.OPENROUTER_MODEL || 'google/gemini-flash-1.5';
    }

    async analyzeAudio(audioBuffer, mimeType, type = 'general', targetText = null, retryCount = 0) {
        try {
            console.log(`Audio tahlili boshlandi: Mime: ${mimeType}, Hajm: ${audioBuffer.length} bytes`);
            let contextInstruction = "";
            if (type === 'test' && targetText) {
                contextInstruction = `Focus analysis on word: "${targetText}".`;
            } else if (type === 'compare' && targetText) {
                contextInstruction = `Compare audio to text: "${targetText}".`;
            }

            const prompt = `
                Analyze English audio (Azure/Cambridge style). 
                ${contextInstruction}
                Feedback in UZBEK. Transcription/IPA in English.

                Metrics (0-100):
                1. Phonetic Accuracy.
                2. Oral Fluency (fillers "uh", "um", pauses "...").
                3. Prosody.
                4. Word Accuracy.
                5. Grammar/Lexical.
                6. Intelligibility.

                IMPORTANT: Return ONLY a valid JSON object.
                {
                    "overallScore": number,
                    "accuracyScore": number,
                    "fluencyScore": number,
                    "prosodyScore": number,
                    "completenessScore": number,
                    "wordAccuracy": number,
                    "ipa": "IPA",
                    "stressExample": "STRESS",
                    "transcription": "Verbatim",
                    "englishLevel": "CEFR",
                    "detailedFeedback": {
                        "strengths": ["UZB"],
                        "areasForImprovement": ["UZB"],
                        "phoneticAnalysis": {
                            "mispronouncedWords": [{"word": "str", "errorType": "type", "phoneticError": "UZB", "correctPronunciation": "IPA", "improvementTip": "UZB"}],
                            "prosodyFeedback": "UZB"
                        },
                        "actionPlan": ["steps UZB"]
                    }
                }
            `;

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: this.modelName,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt.replace(/\s+/g, ' ').trim() // Promptni siqish
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${mimeType};base64,${audioBuffer.toString("base64")}`
                                }
                            }
                        ]
                    }
                ],
                temperature: 0.1, 
                max_tokens: 2000
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/ravon-ai',
                    'X-Title': 'Ravon AI Bot',
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 60 sekund kutish (audio tahlili uzoqroq vaqt olishi mumkin)
            });

            if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                console.error("OpenRouter javobi bo'sh:", JSON.stringify(response.data));
                throw new Error("OpenRouterdan bo'sh javob keldi.");
            }

            const text = response.data.choices[0].message.content;
            const usage = response.data.usage;
            
            let assessmentData;
            try {
                assessmentData = JSON.parse(text);
            } catch (e) {
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    assessmentData = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error("OpenRouter returned invalid JSON format.");
                }
            }

            return {
                ...assessmentData,
                _usage: usage,
                _model: this.modelName
            };
        } catch (error) {
            if (error.response) {
                console.error("OpenRouter API Xatosi (Response):", JSON.stringify(error.response.data));
            } else {
                console.error("OpenRouter API Xatosi (Message):", error.message);
            }
            
            if (retryCount < 2) {
                console.log(`Retrying... (${retryCount + 1})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.analyzeAudio(audioBuffer, mimeType, type, targetText, retryCount + 1);
            }
            
            throw error;
        }
    }

    async generateTestText(difficulty = 'medium', type = 'sentence') {
        try {
            const timestamp = Date.now();
            const randomSeed = Math.random().toString(36).substring(7);
            let prompt = '';
            
            if (type === 'text') {
                prompt = `
                    Generate a UNIQUE English text for pronunciation practice. 
                    Difficulty: ${difficulty}
                    Type: longer text with 4-5 sentences
                    Session ID: ${randomSeed}
                    
                    Requirements:
                    - Create ORIGINAL content, do not repeat common examples
                    - Use different vocabulary and themes each time
                    - Common English words and phrases appropriate for ${difficulty} level
                    - Suitable for pronunciation testing
                    - Length: exactly 4-5 sentences (20-50 words total)
                    - Include various phonetic sounds
                    - Natural flow and context
                    - Make it engaging and different from previous responses
                    - Focus on: ${['daily life', 'technology', 'nature', 'education', 'work', 'hobbies'][Math.floor(Math.random() * 6)]} topic
                    
                    Return ONLY the generated text, no explanations or formatting.
                `;
            } else {
                prompt = `
                    Generate a UNIQUE English text for pronunciation practice. 
                    Difficulty: ${difficulty}
                    Type: ${type === 'word' ? 'single word' : 'sentence or short paragraph'}
                    Session ID: ${randomSeed}
                    
                    Requirements:
                    - Create ORIGINAL content, avoid clichés and common examples
                    - Use varied vocabulary appropriate for ${difficulty} level
                    - Suitable for pronunciation testing
                    - ${type === 'word' ? 'IMPORTANT: Return ONLY ONE SINGLE WORD. Absolutely no phrases, no sentences, no spaces.' : 'Length: 5-15 words'}
                    - Include various phonetic sounds
                    - Make it interesting and educational
                    - Focus on: ${['daily life', 'technology', 'nature', 'education', 'work', 'hobbies'][Math.floor(Math.random() * 6)]} topic
                    
                    Return ONLY the generated ${type === 'word' ? 'word' : 'text'}, no explanations, no quotes, no periods at the end of single words.
                `;
            }

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: this.modelName,
                messages: [
                    {
                        role: "user",
                        content: prompt.trim()
                    }
                ],
                temperature: type === 'text' ? 0.9 : 0.7,
                max_tokens: type === 'text' ? 200 : 100
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/ravon-ai',
                    'X-Title': 'Ravon AI Bot',
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                throw new Error("OpenRouterdan bo'sh javob keldi.");
            }

            const generatedText = response.data.choices[0].message.content.trim();
            
            // Clean and validate the generated text
            const cleanText = generatedText.replace(/[^\w\s.,!?'-]/g, '').trim();
            
            if (!cleanText || cleanText.length < 2) {
                throw new Error("Generated text is too short or invalid");
            }

            // For text type, ensure it has 4-5 sentences
            if (type === 'text') {
                const sentenceCount = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
                if (sentenceCount < 4 || sentenceCount > 5) {
                    console.warn(`Generated text has ${sentenceCount} sentences, expected 4-5`);
                }
            }

            // For word type, ensure it's truly a single word
            if (type === 'word') {
                const words = cleanText.split(/\s+/).filter(w => w.length > 0);
                if (words.length > 0) {
                    return words[0]; // Take only the first word if AI returned more
                }
            }

            return cleanText;
        } catch (error) {
            console.error("AI text generation error:", error.message);
            throw new Error(`AI matn yaratishda xatolik: ${error.message}`);
        }
    }
}

module.exports = new GeminiService();
