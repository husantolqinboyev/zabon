const axios = require('axios');
const config = require('../config');

class OpenRouterService {
    constructor() {
        if (!config.OPENROUTER_API_KEY) {
            console.error("OPENROUTER_API_KEY topilmadi!");
            return;
        }
        this.apiKey = config.OPENROUTER_API_KEY;
        this.models = [
            'google/gemini-2.0-flash-exp:free',
            'google/gemini-2.0-flash-lite-preview-02-05:free',
            'google/gemini-flash-1.5:free',
            'google/gemini-2.0-flash-001',
            'google/gemini-2.0-flash-lite-001',
            'google/gemini-flash-1.5',
            'google/gemini-flash-1.5-8b'
        ];
        if (config.OPENROUTER_MODEL && !this.models.includes(config.OPENROUTER_MODEL)) {
            this.models.unshift(config.OPENROUTER_MODEL);
        }
        this.currentModelIndex = 0;
    }

    async analyzeAudio(audioBuffer, mimeType, type = 'general', targetText = null, retryCount = 0) {
        const MAX_RETRIES = 5;
        const INITIAL_BACKOFF = 3000;
        const currentModel = this.models[this.currentModelIndex];
        const apiKey = config.OPENROUTER_API_KEY;

        if (!apiKey) {
            throw new Error("OPENROUTER_API_KEY sozlanmagan.");
        }

        try {
            const base64Audio = audioBuffer.toString('base64');
            
            let contextInstruction = "";
            if (type === 'test' && targetText) {
                contextInstruction = `The user is specifically trying to pronounce the word: "${targetText}". Focus your analysis on this word.`;
            } else if (type === 'compare' && targetText) {
                contextInstruction = `The user is reading the following text: "${targetText}". Compare the audio strictly to this text.`;
            }

            const prompt = `
                You are a world-class English Language Proficiency Assessor, mimicking the high-precision analysis of Azure Speech Services and Cambridge English Examiners.
                ${contextInstruction}
                Your task is to provide a rigorous, professional, and extremely detailed phonetic and linguistic assessment of the provided audio recording.
                
                IMPORTANT: Provide all explanations, feedback, strengths, and action plans in UZBEK language. The transcription and phonetic errors should remain in English/IPA, but the descriptions and tips must be in UZBEK.

                Evaluate the speech with absolute precision across these dimensions:
                1. **Phonetic Accuracy (0-100)**: Detect mispronunciations at the phoneme level. Analyze vowel length, consonant articulation, and diphthong purity.
                2. **Oral Fluency (0-100)**: Analyze speech rate (words per minute), hesitation patterns, and the placement of pauses. **CRITICAL: Include fillers like "uh", "um", "mmm" and indicate long pauses with "..." in the transcription.**
                3. **Prosody & Intonation (0-100)**: Evaluate word-level stress, sentence-level rhythm (stress-timed nature of English), and pitch contours.
                4. **Word Accuracy (0-100)**: Calculate the percentage of correctly pronounced words relative to the total words spoken.
                5. **Grammar & Lexical Complexity (0-100)**: Assess the sophistication of vocabulary and grammatical accuracy.
                6. **Intelligibility Score (0-100)**: Overall clarity for a native listener.

                Format your response as a JSON object:
                {
                    "overallScore": number,
                    "accuracyScore": number,
                    "fluencyScore": number,
                    "prosodyScore": number,
                    "completenessScore": number,
                    "wordAccuracy": number,
                    "transcription": "Verbatim transcription including fillers (uh, um) and pauses (...)",
                    "englishLevel": "CEFR Level (e.g., B2 High)",
                    "detailedFeedback": {
                        "strengths": ["string in Uzbek"],
                        "areasForImprovement": ["string in Uzbek"],
                        "phoneticAnalysis": {
                            "mispronouncedWords": [
                                {
                                    "word": "string",
                                    "errorType": "Vowel/Consonant/Stress",
                                    "phoneticError": "Specific description in UZBEK (e.g., 'uzun /i:/ o'rniga qisqa /ɪ/ ishlatildi')",
                                    "correctPronunciation": "IPA guide",
                                    "improvementTip": "Practical advice in UZBEK to fix this specific word"
                                }
                            ],
                            "prosodyFeedback": "Detailed notes on rhythm, intonation, stress patterns, and FLUENCY (pauses, repetitions) in UZBEK"
                        },
                        "actionPlan": ["3-5 high-impact steps in UZBEK to reach the next CEFR level"]
                    }
                }

                Strictly focus on objective data. If the audio quality is poor, mention it in feedback but still attempt the analysis.
                For each mispronounced word, be extremely specific about which phoneme was incorrect.
                Your tone must be academic, authoritative, yet encouraging.
            `;
             
            console.log(`OpenRouter tahlil boshlandi. Model: ${currentModel}`);
             
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: currentModel,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt
                            },
                            {
                                type: "input_audio",
                                input_audio: {
                                    data: base64Audio,
                                    format: mimeType.includes('ogg') ? 'ogg' : (mimeType.includes('mpeg') ? 'mp3' : 'wav')
                                }
                            }
                        ]
                    }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/prebot',
                    'X-Title': 'PreBot English Assessment',
                    'Content-Type': 'application/json',
                    'X-OpenRouter-Model': currentModel // Extra hint for model routing
                },
                timeout: 90000 // 90 seconds
            });

            let resultText = response.data.choices[0].message.content;
            
            // JSONni matn ichidan qidirib topish (agar model JSON mode'da javob bermasa)
            try {
                return JSON.parse(resultText);
            } catch (e) {
                const jsonMatch = resultText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                throw new Error("Model javobi JSON formatida emas.");
            }

        } catch (error) {
            // 429 (Rate Limit) yoki 503 (Service Unavailable) bo'lsa qayta urinib ko'rish
            if (error.response && (error.response.status === 429 || error.response.status === 503)) {
                if (retryCount < 2) { // Try 2 times on the same model
                    const backoffTime = INITIAL_BACKOFF * Math.pow(2, retryCount);
                    console.warn(`${error.response.status} xatosi. ${backoffTime}ms dan keyin qayta urinib ko'riladi (Urinish: ${retryCount + 1}/2)`);
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                    return this.analyzeAudio(audioBuffer, mimeType, type, targetText, retryCount + 1);
                } else {
                    // 2 marta urinishdan keyin ham 429 bo'lsa, keyingi modelga o'tish
                    if (this.currentModelIndex < this.models.length - 1) {
                        this.currentModelIndex++;
                        console.log(`Model band (429). Muqobil modelga o'tilmoqda: ${this.models[this.currentModelIndex]}`);
                        return this.analyzeAudio(audioBuffer, mimeType, type, targetText, 0);
                    }
                }
            }

            // Agar barcha urinishlar tugasa yoki model topilmasa (404), muqobil modelga o'tish
            if (this.currentModelIndex < this.models.length - 1) {
                const oldModel = this.models[this.currentModelIndex];
                
                console.error(`Xatolik yuz berdi (${error.response ? error.response.status : error.message}). Model: ${oldModel}`);
                if (error.response && error.response.data) {
                    console.error("Xatolik tafsiloti:", JSON.stringify(error.response.data.error || error.response.data, null, 2));
                }

                this.currentModelIndex++;
                const newModel = this.models[this.currentModelIndex];
                console.log(`Muqobil modelga o'tilmoqda: ${newModel}`);
                
                return this.analyzeAudio(audioBuffer, mimeType, type, targetText, 0);
            }

            console.error("OpenRouter API Error Details:");
            if (error.response) {
                console.error("Status:", error.response.status);
                console.error("Data:", JSON.stringify(error.response.data, null, 2));
                console.error("Model used:", currentModel);
            } else {
                console.error("Message:", error.message);
            }
            throw error;
        }
    }
}

module.exports = new OpenRouterService();
