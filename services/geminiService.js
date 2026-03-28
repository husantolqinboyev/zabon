const axios = require('axios');
const config = require("../config");

class GeminiService {
    constructor() {
        if (!config.OPENROUTER_API_KEY) {
            console.error("OPENROUTER_API_KEY topilmadi!");
            return;
        }
        this.apiKey = config.OPENROUTER_API_KEY;
        this.modelName = config.OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite-001';
    }

    async analyzeAudio(audioBuffer, mimeType, type = 'general', targetText = null, targetLang = 'en', retryCount = 0) {
        try {
            const constants = require('../constants');
            const langConfig = constants.SUPPORTED_LANGUAGES[targetLang] || constants.SUPPORTED_LANGUAGES.en;
            
            console.log(`Audio tahlili boshlandi: Mime: ${mimeType}, Hajm: ${audioBuffer.length} bytes, Til: ${targetLang}`);
            let contextInstruction = "";
            if (type === 'test' && targetText) {
                contextInstruction = `Focus analysis on word: "${targetText}".`;
            } else if (type === 'compare' && targetText) {
                contextInstruction = `Compare audio to text: "${targetText}".`;
            }

            const prompt = `
                ${langConfig.instruction}
                ${contextInstruction}
                You are a world-class Language Proficiency Assessor specializing in ${langConfig.name}. 
                Analyze the audio with absolute precision and give a score based on REAL proficiency, not just effort.
                
                IMPORTANT: Feedback MUST be in UZBEK. Transcription/IPA in ${langConfig.name}.
                
                SCORING SYSTEM (0-100):
                - 90-100: Native-like. Perfect pronunciation, rhythm, and clarity.
                - 75-89: Very good. Small errors that don't affect understanding.
                - 55-74: Good. Noticeable accent/errors, but mostly understandable.
                - 30-54: Poor. Many errors, hard to understand.
                - 0-29: Unintelligible or wrong language.
                
                CRITICAL WARNING: 
                - Do NOT default to middle scores (60-70). 
                - If the user is speaking the WRONG LANGUAGE (e.g., Uzbek instead of ${langConfig.name}), the score MUST be below 20.
                - Be extremely strict with non-native speakers. If sounds are incorrect, reflect it in the score immediately.
                - Each score (accuracy, fluency, prosody) must be evaluated independently.

                Return ONLY a valid JSON object:
                {
                    "overallScore": number (weighted average),
                    "accuracyScore": number (phonetic precision),
                    "fluencyScore": number (speed and smoothness),
                    "prosodyScore": number (rhythm and stress),
                    "completenessScore": number (how much of the target text was said),
                    "wordAccuracy": number (percentage of correctly pronounced words),
                    "ipa": "IPA transcription for ${langConfig.name}",
                    "stressExample": "STRESS patterns",
                    "transcription": "Verbatim transcription in ${langConfig.name}",
                    "englishLevel": "CEFR Level (e.g., A1, B2, C1)",
                    "detailedFeedback": {
                        "strengths": ["at least 2 specific strengths in UZBEK"],
                        "areasForImprovement": ["at least 2 specific areas in UZBEK"],
                        "phoneticAnalysis": {
                            "mispronouncedWords": [{"word": "string", "errorType": "Vowel/Consonant/Stress", "phoneticError": "Description in UZBEK", "correctPronunciation": "IPA", "improvementTip": "Advice in UZBEK"}],
                            "prosodyFeedback": "Detailed rhythm/intonation feedback in UZBEK"
                        },
                        "actionPlan": ["3 specific steps in UZBEK"]
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
                    'HTTP-Referer': 'https://github.com/zabon-ai',
                    'X-Title': 'Zabon AI Bot',
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
                targetLang: targetLang, // Add targetLang to the result
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
                return this.analyzeAudio(audioBuffer, mimeType, type, targetText, targetLang, retryCount + 1);
            }
            
            throw error;
        }
    }

    async generateTestText(difficulty = 'medium', type = 'sentence', targetLang = 'en') {
        try {
            const constants = require('../constants');
            const langConfig = constants.SUPPORTED_LANGUAGES[targetLang] || constants.SUPPORTED_LANGUAGES.en;
            const scriptInstruction = langConfig.script ? `Use only ${langConfig.script} script.` : '';
            
            const timestamp = Date.now();
            const randomSeed = Math.random().toString(36).substring(7);
            let prompt = '';
            
            if (type === 'text') {
                prompt = `
                    Generate a UNIQUE ${langConfig.name} text for pronunciation practice. 
                    Difficulty: ${difficulty}
                    Type: longer text with 4-5 sentences
                    ${scriptInstruction}
                    
                    Requirements:
                    - Create ORIGINAL content, do not repeat common examples
                    - Use different vocabulary and themes each time
                    - Common ${langConfig.name} words and phrases appropriate for ${difficulty} level
                    - Suitable for pronunciation testing
                    - Length: exactly 4-5 sentences (20-50 words total)
                    - Include various phonetic sounds
                    - Natural flow and context
                    - Make it engaging and different from previous responses
                    - Focus on: ${['daily life', 'technology', 'nature', 'education', 'work', 'hobbies'][Math.floor(Math.random() * 6)]} topic
                    
                    Return ONLY the generated text, no explanations, no formatting, no "Session ID", no "Text:" prefix.
                    IMPORTANT: Use ${langConfig.script || 'native'} characters/alphabet only.
                `;
            } else {
                prompt = `
                    Generate a UNIQUE ${langConfig.name} text for pronunciation practice. 
                    Difficulty: ${difficulty}
                    Type: ${type === 'word' ? 'single word' : 'sentence or short paragraph'}
                    ${scriptInstruction}
                    
                    Requirements:
                    - Create ORIGINAL content, avoid clichés and common examples
                    - Use varied vocabulary appropriate for ${difficulty} level
                    - Suitable for pronunciation testing
                    - ${type === 'word' ? 'IMPORTANT: Return ONLY ONE SINGLE WORD. Absolutely no phrases, no sentences, no spaces.' : 'Length: 5-15 words'}
                    - Include various phonetic sounds
                    - Make it interesting and educational
                    - Focus on: ${['daily life', 'technology', 'nature', 'education', 'work', 'hobbies'][Math.floor(Math.random() * 6)]} topic
                    
                    Return ONLY the generated ${type === 'word' ? 'word' : 'text'}, no explanations, no quotes, no periods at the end of single words, no "Session ID".
                    IMPORTANT: Use ${langConfig.script || 'native'} characters/alphabet only.
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
                    'HTTP-Referer': 'https://github.com/zabon-ai',
                    'X-Title': 'Zabon AI Bot',
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                throw new Error("OpenRouterdan bo'sh javob keldi.");
            }

            let text = response.data.choices[0].message.content.trim();
            
            // Clean common patterns
            text = text.replace(/Session ID:? \w+/gi, '')
                       .replace(/Text:? /gi, '')
                       .replace(/^"|"$/g, '') // Remove wrapping quotes
                       .trim();
                       
            return text;
        } catch (error) {
            console.error("AI text generation error:", error.message);
            throw new Error(`AI matn yaratishda xatolik: ${error.message}`);
        }
    }
}

module.exports = new GeminiService();
