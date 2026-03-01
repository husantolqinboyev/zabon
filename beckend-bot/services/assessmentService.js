const geminiService = require('./geminiService');
const database = require('../database');

class AssessmentService {
    async processAudio(user, audioBuffer, audioDuration, mimeType, type = 'general', targetText = null) {
        try {
            // Check limits
            const canProceed = await database.checkLimit(user.id);
            if (!canProceed) {
                throw new Error('LIMIT_EXCEEDED');
            }

            // Step 1: Analyze audio with Gemini
            const assessment = await geminiService.analyzeAudio(audioBuffer, mimeType, type, targetText);

            // Log API usage if available
            if (assessment._usage) {
                try {
                    // OpenRouter usage structure can be different
                    const promptTokens = assessment._usage.prompt_tokens || assessment._usage.promptTokenCount || 0;
                    const completionTokens = assessment._usage.completion_tokens || assessment._usage.candidatesTokenCount || 0;
                    const totalTokens = assessment._usage.total_tokens || assessment._usage.totalTokenCount || 0;

                    await database.logApiUsage(
                        assessment._model,
                        promptTokens,
                        completionTokens,
                        totalTokens,
                        `assessment_${type}`
                    );
                } catch (logError) {
                    console.error('Failed to log API usage:', logError);
                }
            }

            // Step 2: Save assessment to database
            const userId = await database.saveUser(user);
            await database.saveAssessment(userId, {
                audioDuration,
                type,
                target_text: targetText,
                ...assessment,
                feedback: JSON.stringify(assessment.detailedFeedback)
            });

            // Increment usage
            await database.incrementUsage(user.id);

            // Add targetText to assessment for formatting
            assessment.targetText = targetText;

            // Step 3: Format response
            const formattedResponse = this.formatAssessmentResponse(assessment, type);
            return {
                success: true,
                text: formattedResponse,
                data: {
                    ...assessment,
                    targetText: targetText
                }
            };

        } catch (error) {
            console.error('Assessment processing error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    formatAssessmentResponse(assessment, type = 'general') {
        // Detect if it's a single word or very short phrase (max 2 words)
        const wordCount = assessment.targetText ? assessment.targetText.trim().split(/\s+/).length : 0;
        const isWordAnalysis = wordCount > 0 && wordCount <= 2;

        if (type === 'compare') {
            if (isWordAnalysis) {
                return this.formatWordAssessmentResponse(assessment);
            } else if (wordCount > 2) {
                return this.formatTextAssessmentResponse(assessment);
            }
        }

        let response = `📊 *PROFESSIONAL TALAFFUZ TAHLILI*\n`;
        if (type === 'test') response = `🎯 *TALAFFUZ TESTI NATIJASI*\n`;
        if (type === 'compare') response = `📝 *MATN VA AUDIO TAQQOSLASH*\n`;

        response += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        response += `🏆 *UMUMIY NATIJA: ${assessment.overallScore}/100*\n`;
        response += `🎓 *DARAJA: ${assessment.englishLevel}*\n\n`;

        response += `📝 *KO'RSATKICHLAR:*\n`;
        response += `🎯 Talaffuz aniqligi: *${assessment.accuracyScore}%*\n`;
        response += `⚡ Ravonlik (Fluency): *${assessment.fluencyScore}%*\n`;
        response += `🎵 Ohang (Prosody): *${assessment.prosodyScore}%*\n`;
        response += `✅ To'liqlik (Completeness): *${assessment.completenessScore}%*\n`;
        if (assessment.wordAccuracy !== undefined) {
            response += `📊 To'g'ri o'qilgan so'zlar: *${assessment.wordAccuracy}%*\n`;
        }
        response += `\n`;

        response += `💬 *TRANSKRIPSIYA (Matn):*\n`;
        response += `_"${assessment.transcription}"_\n\n`;

        const feedback = assessment.detailedFeedback;

        if (feedback.phoneticAnalysis.mispronouncedWords && feedback.phoneticAnalysis.mispronouncedWords.length > 0) {
            response += `⚠️ *XATOLAR TAHLILI:*\n`;
            feedback.phoneticAnalysis.mispronouncedWords.slice(0, 10).forEach(m => {
                const errorType = m.errorType ? `[${m.errorType}] ` : '';
                response += `• *${m.word}* ${errorType}\n`;
                response += `  └ ❌ Xato: _${m.phoneticError}_\n`;
                response += `  └ ✅ To'g'ri: \`${m.correctPronunciation}\`\n`;
                if (m.improvementTip) {
                    response += `  └ 💡 Maslahat: _${m.improvementTip}_\n`;
                }
            });
            response += `\n`;
        }

        if (feedback.phoneticAnalysis.prosodyFeedback) {
            response += `🎵 *OHANG VA RITM:*\n`;
            response += `_${feedback.phoneticAnalysis.prosodyFeedback}_\n\n`;
        }

        response += `🌟 *KUCHLI TOMONLARINGIZ:*\n`;
        feedback.strengths.slice(0, 3).forEach(s => response += `✅ ${s}\n`);
        response += `\n`;

        response += `📈 *RIVOJLANISH REJASI:*\n`;
        feedback.actionPlan.slice(0, 3).forEach(p => response += `🚀 ${p}\n`);

        response += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
        response += `_Ravon AI • Professional Tahlil_`;

        return response;
    }

    formatTextAssessmentResponse(assessment) {
        try {
            const feedback = assessment.detailedFeedback || {};
            const phoneticAnalysis = feedback.phoneticAnalysis || {};
            const mispronouncedWords = phoneticAnalysis.mispronouncedWords || [];
            const actionPlan = feedback.actionPlan || [];
            const score = assessment.overallScore || 0;

            let status = "🔴 (Rivojlanish kerak)";
            if (score >= 80) status = "🟢 (Ajoyib!)";
            else if (score >= 60) status = "🟡 (Yaxshi, lekin rivojlanish kerak)";

            let response = `📊 *Talaffuzingiz Tahlili Tayyor! Natija: ${score}% ${status}* \n\n`;

            if (assessment.ipa) {
                response += `📖 *Matn Transkripsiyasi:* ${assessment.ipa}\n\n`;
            }

            response += `🔍 *Tahlil natijalari:* \n\n`;

            // 1. Pronunciation Errors
            if (mispronouncedWords.length > 0) {
                response += `⚠️ *1. Talaffuz xatosi:* \n`;
                mispronouncedWords.slice(0, 3).forEach(m => {
                    const word = m.word || "So'z";
                    const correct = m.correctPronunciation || "";
                    const error = m.phoneticError || "";
                    response += `• *${word}* ${correct ? `[${correct}]` : ''} — ${error}\n`;
                    if (m.improvementTip) response += `  └ To'g'rilash: ${m.improvementTip}\n`;
                });
                response += `\n`;
            }

            // 2. Stress
            response += `⚖️ *2. Urg'u (Stress):* \n`;
            if (phoneticAnalysis.prosodyFeedback) {
                response += `${phoneticAnalysis.prosodyFeedback}\n`;
            }
            if (assessment.stressExample) {
                response += `• *${assessment.stressExample}*\n`;
            }
            response += `\n`;

            // 3. Fluency
            response += `🐢 *3. Ravonlik (Fluency):* \n`;
            response += `Nutqingizda ravonlik ko'rsatkichi: *${assessment.fluencyScore || 0}%*.\n`;
            const fluencyTips = actionPlan.filter(p => p.toLowerCase().includes('ravon') || p.toLowerCase().includes('bog\'lab'));
            if (fluencyTips.length > 0) {
                response += `• Maslahat: ${fluencyTips[0]}\n`;
            }
            response += `\n`;

            // Recommendations
            response += `💡 *Tavsiyalar:* \n`;
            actionPlan.slice(0, 3).forEach(p => response += `✅ ${p}\n`);
            response += `✅ Taqqoslash: Bot yuborgan audio bilan o'z ovozingizni solishtirib, xatolarni tahlil qiling. \n\n`;

            response += `🚀 *Talaffuzni 100% ga chiqaring!* Kursimizda barcha tovushlar, urg'u qoidalari va ravon gapirish sirlari noldan o'rgatilgan. \n\n`;

            response += `🔗 *Batafsil:* [ https://t.me/+Pl610Bsw6YA4M2Ri ] \n`;

            return response;
        } catch (e) {
            console.error('Format text response error:', e);
            return `📊 *Talaffuz tahlili tayyor!* \nUmumiy natija: ${assessment.overallScore}%`;
        }
    }

    formatWordAssessmentResponse(assessment) {
        try {
            const feedback = assessment.detailedFeedback || {};
            const phoneticAnalysis = feedback.phoneticAnalysis || {};
            const mispronouncedWords = phoneticAnalysis.mispronouncedWords || [];
            const targetWord = assessment.targetText || assessment.transcription || "Noma'lum";
            const ipa = assessment.ipa || "";
            const score = assessment.overallScore || 0;

            let response = `🌟 *Tahlil Tayyor!* \n\n`;
            response += `📝 *So'z:* ${targetWord} ${ipa ? `[/${ipa}/]` : ''} 🎯 *Natija:* ${score}% ✅ \n\n`;

            if (mispronouncedWords.length > 0) {
                response += `❌ *Xatoliklar:* \n`;
                mispronouncedWords.slice(0, 5).forEach(m => {
                    const word = m.word || targetWord;
                    const error = m.phoneticError || "Talaffuzda xatolik";
                    const tip = m.improvementTip || "";
                    const correct = m.correctPronunciation || "";

                    response += `• *"${word}"* — ${error}\n`;
                    if (correct) response += `  └ ✅ *To'g'ri talaffuz:* [/${correct}/]\n`;
                    if (tip) response += `  └ 💡 *Qanday to'g'rilash mumkin:* ${tip}\n`;
                });
                response += `\n`;
            } else {
                response += `✅ *Xatoliklar aniqlanmadi. Ajoyib talaffuz!*\n\n`;
            }

            response += `💡 *Maslahat:* O'z audiongizni bot audiosi bilan solishtiring va xato so'zni 5 marta qayta ayting. \n\n`;

            response += `🚀 *Talaffuzni 100% ga chiqaring!* Kursimizda barcha tovushlar va qoidalar noldan o'rgatilgan. \n\n`;

            response += `🔗 *Batafsil:* [ https://t.me/+Pl610Bsw6YA4M2Ri ] \n`;

            return response;
        } catch (e) {
            console.error('Format word response error:', e);
            return `🌟 *Tahlil tayyor!* \nNatija: ${assessment.overallScore}%`;
        }
    }

    async getLastAssessment(telegramId) {
        return await database.getLastAssessment(telegramId);
    }

    async getUserStats(telegramId) {
        return await database.getUserStats(telegramId);
    }
}

module.exports = new AssessmentService();
