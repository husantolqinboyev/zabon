const { Markup } = require('telegraf');
const axios = require('axios');
const assessmentService = require('../services/assessmentService');
const ttsService = require('../services/ttsService');
const pdfService = require('../services/pdfService');
const database = require('../database');
const config = require('../config');
const { checkTextLimit } = require('../utils/textUtils');
const audioUtils = require('../utils/audioUtils');

class AudioHandler {
    async handleAudio(ctx) {
        try {
            // Check if message has audio or voice
            const audio = ctx.message.audio || ctx.message.voice;

            if (!audio) {
                // If it's just text, it might be for Compare or TTS
                return this.handleText(ctx);
            }

            // Get file info
            const fileId = audio.file_id;
            const duration = audio.duration || 0;
            const mimeType = audio.mime_type || (ctx.message.voice ? 'audio/ogg' : 'audio/mpeg');

            // Get user to check limits
            const user = await database.getUserByTelegramId(ctx.from.id);
            const maxDuration = audioUtils.getUserAudioLimit(user);

            // Check duration
            if (duration > maxDuration) {
                const limitMsg = maxDuration >= 60
                    ? `${maxDuration / 60} minut`
                    : `${maxDuration} soniya`;

                await ctx.reply(`⚠️ Audio juda uzun. Sizning tarifingizda maksimal davomiylik ${limitMsg}.\n\nPremium obunada bu limit 4 minutgacha oshadi!`);
                return;
            }

            const state = ctx.session?.state;
            let type = 'general';
            let targetText = null;
            let taskId = null;

            let task = null;

            if (state === 'waiting_for_test_audio') {
                type = 'test';
                targetText = ctx.session.testWord;
            } else if (state === 'waiting_for_compare_audio') {
                type = 'compare';
                targetText = ctx.session.compareText;
            } else if (state === 'completing_task') {
                type = 'task';
                taskId = ctx.session.currentTaskId;
                // Get task details for target text
                task = await database.getTaskById(taskId);
                if (task) {
                    targetText = task.task_text;
                }
            }

            // Send processing message
            let processingText = "Audio qabul qilindi! Tahlil qilinmoqda... ⏳";
            if (state === 'waiting_for_compare_audio') {
                processingText = "Yaxshi, endi sizga talaffuzingizni tahlil qilib beraman... ⏳";
            } else if (state === 'completing_task') {
                processingText = "Topshiriq uchun audio qabul qilindi! Tahlil qilinmoqda... ⏳";
            }
            const processingMsg = await ctx.reply(processingText);

            // Download audio file
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const audioBuffer = await this.downloadAudio(fileLink.href);

            if (!audioBuffer || audioBuffer.length === 0) {
                await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => { });
                return ctx.reply("❌ Audioni yuklab olishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
            }

            // Process audio
            const result = await assessmentService.processAudio(
                ctx.from,
                audioBuffer,
                duration,
                mimeType,
                type,
                targetText
            );

            if (!result || !result.success) {
                await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => { });
                const errorMsg = result?.error === 'LIMIT_EXCEEDED'
                    ? "⚠️ Kunlik limitingiz tugagan. Iltimos, keyinroq urinib ko'ring yoki Premium oling."
                    : "❌ Audio tahlilida xatolik yuz berdi. Iltimos, qayta urinib ko'ring.";
                return ctx.reply(errorMsg);
            }

            // Delete processing message and send result
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => { });

            // Store assessment data in session for PDF generation
            if (!ctx.session) {
                ctx.session = {};
            }
            ctx.session.lastAssessmentData = result.data;
            ctx.session.lastAssessmentType = type;

            const isWordAnalysis = targetText && targetText.trim().split(/\s+/).length <= 2;

            let inlineButtons = [];
            if (!isWordAnalysis) {
                inlineButtons.push([Markup.button.callback('📄 PDF shaklida yuklab olish', 'download_pdf_report')]);
            }

            const playButtonLabel = isWordAnalysis ? '🔊 So\'z audiosini olish' : '🎧 Matn audiosini eshitish';
            inlineButtons.push([Markup.button.callback(playButtonLabel, `play_correct_${type}`)]);

            const inlineMenu = Markup.inlineKeyboard(inlineButtons);

            await ctx.reply(result.text, {
                parse_mode: 'Markdown',
                ...inlineMenu
            });

            // Section 1: Automatically send PDF report for tests (but not for short words in compare)
            if (type === 'test' && !isWordAnalysis) {
                try {
                    const pdfMsg = await ctx.reply("📄 PDF hisobot tayyorlanmoqda... ⏳");
                    const pdfPath = await pdfService.generateReport(ctx.from, result.data, type);

                    await ctx.replyWithDocument({
                        source: pdfPath,
                        filename: `Talaffuz_Tahlili_${ctx.from.id}.pdf`
                    }, {
                        caption: "✅ Sizning to'liq talaffuz tahlili hisobotingiz tayyor!"
                    });

                    await ctx.telegram.deleteMessage(ctx.chat.id, pdfMsg.message_id).catch(() => { });
                    await pdfService.cleanup(pdfPath);
                } catch (pdfErr) {
                    console.error('Auto PDF Error:', pdfErr);
                }
            }

            // Clear state
            if (ctx.session) {
                delete ctx.session.state;
                delete ctx.session.testWord;
                delete ctx.session.compareText;

                // Handle task completion
                if (type === 'task' && taskId) {
                    try {
                        await database.submitTask(taskId, result.data.assessmentId || null);

                        // Notify teacher if task details are available
                        if (task && task.teacher_telegram_id) {
                            try {
                                const studentName = ctx.from.first_name || ctx.from.username || "O'quvchi";
                                const score = result.data?.overallScore || result.data?.overall_score || 0;

                                let teacherMsg = `🔔 *Yangi topshiriq topshirildi!*\n\n` +
                                    `👤 *O'quvchi:* ${studentName}\n` +
                                    `📝 *Topshiriq:* "${task.task_text}"\n` +
                                    `📊 *Natija:* ${score} ball\n\n` +
                                    `Tekshirish uchun o'qituvchi paneliga kiring.`;

                                await ctx.telegram.sendMessage(task.teacher_telegram_id, teacherMsg, { parse_mode: 'Markdown' });
                            } catch (notifyError) {
                                console.error('Teacher notification error:', notifyError);
                            }
                        }

                        // Send task completion message
                        await ctx.reply(
                            "✅ *Topshiriq muvaffaqiyatli topshirildi!*\n\n" +
                            "👨‍🏫 O'qituvchingiz natijalaringizni ko'rib chiqadi.\n" +
                            "📊 Boshqa topshiriqlar uchun '📊 Mening natijalarim' bo'limiga qayting.",
                            { parse_mode: 'Markdown' }
                        );

                        delete ctx.session.currentTaskId;
                    } catch (taskError) {
                        console.error('Task submission error:', taskError);
                        await ctx.reply("⚠️ Topshiriqni topshirishda xatolik yuz berdi, ammo tahlil saqlandi.");
                    }
                }
            }

        } catch (error) {
            console.error('Audio processing error:', error);

            let errorMessage = "Kechirasiz, audioni tahlil qila olmadim. Iltimos, qaytadan urinib ko'ring.";

            if (error.message === 'LIMIT_EXCEEDED') {
                const userId = ctx.from.id;
                const botUsername = ctx.botInfo.username;
                const referralLink = `https://t.me/${botUsername}?start=${userId}`;

                errorMessage = "⚠️ *Kunlik limitingiz tugagan!*\n\n" +
                    "Xavotir olmang, limitingizni osongina oshirishingiz mumkin. " +
                    "Har 3 ta taklif qilingan do'stingiz uchun sizga *+3 ta bonus limit* beriladi!\n\n" +
                    "🔗 *Sizning referal havolangiz:*\n" +
                    `\`${referralLink}\``;

                const shareLink = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Ingliz tili talaffuzini Zabon AI yordamida bepul tahlil qiling! 🚀")}`;

                await ctx.replyWithMarkdown(errorMessage, Markup.inlineKeyboard([
                    [Markup.button.url('📤 Do\'stlarga ulashish', shareLink)],
                    [Markup.button.callback('🔗 Referal bo\'limi', 'show_referral_info')]
                ]));
                return;
            } else if (error.response?.status === 429 || error.message.includes('429')) {
                errorMessage = "⚠️ Zabon AI limiti tugadi. Iltimos, birozdan keyin qayta urinib ko'ring.";
            } else if (error.response?.status === 401 || error.message.includes('401')) {
                errorMessage = "⚠️ Zabon API kaliti bilan muammo yuz berdi.";
            }

            await ctx.reply(errorMessage);
        }
    }

    async handleText(ctx) {
        const text = ctx.message.text;
        const state = ctx.session?.state;

        if (state === 'waiting_for_compare_word' || state === 'waiting_for_compare_text_long') {
            const wordCount = text.trim().split(/\s+/).length;

            if (state === 'waiting_for_compare_word') {
                if (wordCount > 2) {
                    return ctx.reply('⚠️ So\'z rejimida maksimal 2 ta so\'z yuborishingiz mumkin. Iltimos, qaytadan yuboring.');
                }
            } else if (state === 'waiting_for_compare_text_long') {
                if (wordCount < 3) {
                    return ctx.reply('⚠️ Matn rejimida kamida 3 ta so\'z yuborishingiz kerak. Iltimos, qaytadan yuboring.');
                }
            }

            ctx.session.compareText = text;
            ctx.session.state = 'waiting_for_compare_audio';
            return ctx.reply('✨ Ajoyib! Endi audio yuboring 🎙\n\n⚠️ *Eslatma:* Yuborgan audiongiz matnga mos bo\'lishi kerak!', { parse_mode: 'Markdown' });
        }

        if (state === 'waiting_for_tts_text') {
            // Check user's word limit
            const user = await database.getUserByTelegramId(ctx.from.id);
            const limitCheck = checkTextLimit(text, user);

            if (!limitCheck.allowed) {
                return ctx.reply(`⚠️ Matn uzunligi limitdan oshdi!\n\nSizning limitiz: ${limitCheck.limit} so'z\nYuborgan matningiz: ${limitCheck.wordCount} so'z\n\nIltimos, qisqaroq matn yuboring yoki Premium obunaga o'ting.`);
            }

            const canProceed = await database.checkLimit(ctx.from.id);
            if (!canProceed) {
                delete ctx.session.state;
                const userId = ctx.from.id;
                const botUsername = ctx.botInfo.username;
                const referralLink = `https://t.me/${botUsername}?start=${userId}`;

                const msg = "⚠️ *Kunlik limitingiz tugagan!*\n\n" +
                    "Xavotir olmang, limitingizni osongina oshirishingiz mumkin. " +
                    "Har 3 ta taklif qilingan do'stingiz uchun sizga *+3 ta bonus limit* beriladi!\n\n" +
                    "🔗 *Sizning referal havolangiz:*\n" +
                    `\`${referralLink}\``;

                return ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
                    [Markup.button.callback('🔗 Referal bo\'limi', 'show_referral_info')]
                ]));
            }

            await ctx.reply(`Matn qabul qilindi (${limitCheck.wordCount}/${limitCheck.limit} so'z). Audio tayyorlanmoqda... ⏳`);

            try {
                const targetLang = await database.getUserLanguage(ctx.from.id);
                const audioPath = await ttsService.generateAudio(text, targetLang);

                await ctx.replyWithAudio({ source: audioPath });

                // Cleanup temp file
                await ttsService.cleanup(audioPath);

                await database.incrementUsage(ctx.from.id);
                delete ctx.session.state;
            } catch (e) {
                console.error('TTS Error:', e);
                await ctx.reply('Audioni yaratishda xatolik yuz berdi.');
            }
            return;
        }

        if (state === 'waiting_for_new_test_word') {
            const targetLang = ctx.session.manualAddLang || await database.getUserLanguage(ctx.from.id);
            await database.addTestWord(text, 'medium', targetLang);
            delete ctx.session.state;
            delete ctx.session.manualAddLang;
            const isLong = text.trim().split(/\s+/).length > 2;
            const typeText = isLong ? 'Matn' : 'So\'z';
            return ctx.reply(`✅ ${typeText} muvaffaqiyatli qo'shildi!`);
        }

        if (text?.startsWith('/setlimit_')) {
            const isAdmin = await database.isAdmin(ctx.from.id);
            if (!isAdmin) return;
            const parts = text.split('_');
            const targetId = parts[1];
            const limit = parts[2];
            await database.updateUserLimit(targetId, limit);
            return ctx.reply(`✅ Foydalanuvchi (${targetId}) limiti ${limit} ga o'zgartirildi.`);
        }

        if (text?.startsWith('/addteacher_')) {
            const isAdmin = await database.isAdmin(ctx.from.id);
            if (!isAdmin) return;
            const targetId = text.split('_')[1];
            await database.setTeacher(targetId, true);
            return ctx.reply(`✅ Foydalanuvchi (${targetId}) o'qituvchi etib tayinlandi.`);
        }

        if (text?.startsWith('/removeteacher_')) {
            const isAdmin = await database.isAdmin(ctx.from.id);
            if (!isAdmin) return;
            const targetId = text.split('_')[1];
            await database.setTeacher(targetId, false);
            return ctx.reply(`❌ Foydalanuvchi (${targetId}) o'qituvchilikdan olindi.`);
        }
    }

    async downloadAudio(url, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 15000, // 15 seconds timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                return Buffer.from(response.data);
            } catch (error) {
                const isLastRetry = i === retries - 1;
                const isConnReset = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';

                if (isConnReset && !isLastRetry) {
                    console.log(`Audio download failed (${error.code}), retrying... (${i + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1))); // Exponential backoff
                    continue;
                }
                throw error;
            }
        }
    }
}

module.exports = new AudioHandler();
