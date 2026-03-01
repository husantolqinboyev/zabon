const { safeAnswerCbQuery, safeEditMessage } = require('../utils/telegramUtils');
const { Markup } = require('telegraf');
const { checkTextLimit, escapeHTML } = require('../utils/textUtils');
const assessmentService = require('../services/assessmentService');
const pdfService = require('../services/pdfService');
const ttsService = require('../services/ttsService');
const geminiService = require('../services/geminiService');
const database = require('../database');
const config = require('../config');

class CommandHandler {
    constructor() {
        this.mainMenu = Markup.keyboard([
            [Markup.button.webApp('🚀 Ravon AI Mini App', config.APP_URL)],
            ['🎙 Talaffuzni tekshirish', '🔊 Matnni ovozga aylantirish'],
            ['👤 Profil', '💳 Tariflar | Ko\'proq foyda olish'],
            ['❓ Bot qanday ishlaydi?']
        ]).resize();

        this.adminMenu = Markup.keyboard([
            ['👥 Foydalanuvchilar', '➕ Matn qo\'shish'],
            ['🤖 AI matn yaratish', '🤖 AI so\'z yaratish'],
            ['📚 Matnlar ro\'yxati', '📋 Oxirgi natijalar'],
            ['📊 Umumiy statistika', '👨‍🏫 O\'qituvchilar'],
            ['💳 Karta sozlamalari', '💰 Tariflar'],
            ['📩 To\'lov so\'rovlari', '💳 Qolda tarif berish'],
            ['📢 E\'lon berish', '📊 API Monitoring'],
            ['🔙 Asosiy menyu']
        ]).resize();

        this.teacherMenu = Markup.keyboard([
            ['👥 O\'quvchilarim', '➕ Topshiriq berish'],
            ['🤖 AI matn yaratish', '🤖 AI so\'z yaratish'],
            ['📋 Topshiriqlarim', '📚 Matnlar ro\'yxati'],
            ['📊 Natijalar', '🔙 Asosiy menyu']
        ]).resize();
    }

    async handleStart(ctx) {
        const startPayload = ctx.startPayload; // Deep link payload (referrer ID)
        let referrerId = null;

        if (startPayload && !isNaN(startPayload)) {
            referrerId = parseInt(startPayload);
        }

        await database.saveUser(ctx.from, referrerId);

        // Auto-set first user as admin if no admin exists and no ADMIN_ID in .env
        const adminCount = await database.getAdminCount();
        if (adminCount === 0 && (!config.ADMIN_IDS || config.ADMIN_IDS.length === 0)) {
            await database.setAdmin(ctx.from.id, true);
        }

        const isAdmin = await database.isAdmin(ctx.from.id);
        const isTeacher = await database.isTeacher(ctx.from.id);

        // Get monthly users count
        const monthlyUsers = await database.getMonthlyUsers();
        const totalUsers = await database.getTotalUserCount();

        let displayUsers, userLabel;
        if (isAdmin) {
            // Admins see real numbers
            displayUsers = monthlyUsers > 100 ? monthlyUsers : totalUsers;
            userLabel = monthlyUsers > 100 ? 'oylik' : 'jami';
        } else {
            // Public users see impressive multiplied numbers
            if (monthlyUsers > 100) {
                displayUsers = Math.floor(monthlyUsers * 2.5); // Multiply by 2.5
                userLabel = 'oylik';
            } else {
                // Show impressive base number for small user counts
                displayUsers = Math.floor(Math.random() * 50) + 120; // Random between 120-170
                userLabel = 'oylik';
            }
        }

        let welcomeMessage = `Assalomu alaykum! 👋\n\n` +
            `Men **Ravon AI** — sizning ingliz tili talaffuzingizni baholashga yordam beruvchi botman.\n\n` +
            `🎯 **Ravon AI — Talaffuzingizni mukammallashtiring!**\n\n` +
            `Assalomu alaykum! Ingliz tilida ravon gapirishni biz bilan o'rganing.\n\n` +
            `**Bot imkoniyatlari:**\n\n` +
            `✅ **Talaffuzni tekshirish:** Nutqingizni ovozli xabar orqali yuboring va xatolarni aniqlang.\n` +
            `✅ **Matnni audioga o'tkazish:** Har qanday matnni to'g'ri talaffuzda eshiting.\n` +
            `✅ **PDF tahlil:** Nutqingiz natijalarini professional PDF hisobot ko'rinishida oling.\n\n` +
            `🎁 **Siz uchun 3 ta bepul imkoniyat tayyor!**\n\n` +
            `👇 Hoziroq quyidagi bo'limlardan birini tanlang va nutqingizni sinab ko'ring!`;

        if (isAdmin) {
            welcomeMessage += `\n\n👨‍💼 Siz adminsiz. Admin panelga kirish uchun /admin buyrug'ini yuboring.`;
        } else if (isTeacher) {
            welcomeMessage += `\n\n👨‍🏫 Siz o'qituvchisiz. O'qituvchi paneliga kirish uchun /teacher buyrug'ini yuboring.`;
        }

        const inlineKeyboard = Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Ravon AI Web Panel', config.APP_URL)]
        ]);

        await ctx.reply(welcomeMessage, {
            parse_mode: 'Markdown',
            ...this.mainMenu,
            ...inlineKeyboard.reply_markup
        });
    }

    async handleHowItWorks(ctx) {
        await ctx.reply('Botdan foydalanish bo\'yicha video qo\'llanma va PDF qo\'llanma yuborilmoqda...');
    }

    async handleMiniApp(ctx) {
        await ctx.reply('📱 Ravon AI Mini App-ni ochish uchun pastdagi tugmani bosing:',
            Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 Mini App-ni ochish', config.APP_URL)]
            ])
        );
    }

    async handleAdmin(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        const msg = '👨‍💼 Admin panelga xush kelibsiz!';
        if (ctx.callbackQuery) {
            await ctx.editMessageText(msg, this.adminMenu).catch(() => {
                ctx.reply(msg, this.adminMenu);
            });
            await ctx.answerCbQuery();
        } else {
            await ctx.reply(msg, this.adminMenu);
        }
    }

    async handleTeacher(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        await ctx.reply('👨‍🏫 O\'qituvchi paneliga xush kelibsiz!', this.teacherMenu);
    }

    async handleTeachers(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        try {
            const rows = await database.getTeachersAndAdmins();

            let msg = `👨‍🏫 *O'qituvchilar va Adminlar ro'yxati:*\n\n`;
            const buttons = [];

            rows.forEach(u => {
                const role = u.is_admin ? 'Admin' : 'O\'qituvchi';
                msg += `• ${u.first_name} (@${u.username || 'yo\'q'}) - [${role}]\n`;
                if (!u.is_admin) {
                    buttons.push([Markup.button.callback(`❌ ${u.first_name} ni o'chirish`, `toggle_teacher_${u.telegram_id}_0`)]);
                }
            });

            if (buttons.length > 0) {
                ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
            } else {
                ctx.replyWithMarkdown(msg);
            }
        } catch (error) {
            console.error('Error in handleTeachers:', error);
            ctx.reply('Xatolik yuz berdi.');
        }
    }

    async handleMainMenu(ctx) {
        await ctx.reply('🏠 Asosiy menyu:', this.mainMenu);
    }

    async handlePronunciationMenu(ctx) {
        const menu = Markup.inlineKeyboard([
            [Markup.button.callback('✍️ Talaffuz matnni o\'zim yozaman', 'pronunciation_write_own')],
            [Markup.button.callback('🎲 Tasodifiy so\'z va matn', 'pronunciation_random')]
        ]);
        await ctx.reply('🎙 Talaffuzni tekshirish\n\nIltimos, usulni tanlang:', menu);
    }

    async handlePronunciationWriteOwn(ctx) {
        ctx.session = ctx.session || {};
        ctx.session.state = 'waiting_for_text_for_pronunciation';
        await ctx.editMessageText('✍️ Iltimos, talaffuz qilmoqchi bo\'lgan matningizni yozing:').catch(async () => {
            await ctx.reply('✍️ Iltimos, talaffuz qilmoqchi bo\'lgan matningizni yozing:');
        });
        await safeAnswerCbQuery(ctx).catch(() => { });
    }

    async processTextForPronunciation(ctx) {
        const text = ctx.message.text;
        const user = await database.getUserByTelegramId(ctx.from.id);

        // Check word limit
        const limitCheck = checkTextLimit(text, user);

        if (!limitCheck.allowed) {
            return ctx.reply(`⚠️ Matn uzunligi limitdan oshdi!\n\nSizning limitiz: ${limitCheck.limit} so'z\nYuborgan matningiz: ${limitCheck.wordCount} so'z\n\nIltimos, qisqaroq matn yuboring yoki Premium obunaga o'ting.`);
        }

        // Check daily limit
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

        ctx.session.testWord = text;
        ctx.session.state = 'waiting_for_test_audio';

        await ctx.reply(`✅ Ajoyib, endi ovozli xabar yuboring.\n\n_"${text}"_`, { parse_mode: 'Markdown' });
    }

    async handleRandomMenu(ctx) {
        try {
            const msg = "🎲 *Tasodifiy talaffuz mashqi*\n\nQaysi turdagi topshiriqni bajarishni xohlaysiz?";
            const menu = Markup.inlineKeyboard([
                [Markup.button.callback('🔤 So\'z', 'random_word'), Markup.button.callback('📝 Matn', 'random_text')]
            ]);
            await ctx.reply(msg, { parse_mode: 'Markdown', ...menu });
        } catch (error) {
            console.error('Random Menu Error:', error);
            await ctx.reply("Xatolik yuz berdi.");
        }
    }

    async handleRandomStart(ctx) {
        try {
            const type = ctx.callbackQuery.data === 'random_word' ? 'word' : 'text';
            const word = await database.getRandomTestWordByType(type);

            if (!word) {
                return ctx.answerCbQuery(`⚠️ Hozircha tasodifiy ${type === 'word' ? 'so\'zlar' : 'matnlar'} mavjud emas.`, { show_alert: true });
            }

            ctx.session = ctx.session || {};
            ctx.session.testWord = word.word;

            const isLong = word.word.trim().split(/\s+/).length > 2;
            const typeText = isLong ? 'matnni' : 'so\'zni';

            const msg = `🎲 *Tasodifiy ${typeText}!*\n\n👉 *${word.word}*\n\nTayyor bo'lsangiz, "O'qish" tugmasini bosing:`;

            await ctx.editMessageText(msg, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🎙 O\'qish', 'confirm_test_reading')],
                    [Markup.button.callback('🔊 Eshitish', 'listen_test_text')],
                    [Markup.button.callback('🔄 Boshqa tasodifiy', `random_${type}`)]
                ])
            });
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Random Start Error:', error);
            await ctx.answerCbQuery('Xatolik yuz berdi.');
        }
    }

    async handleTestPronunciation(ctx) {
        try {
            const words = await database.getRecentTestWords(10);
            if (!words || words.length === 0) {
                return ctx.reply('Hozircha test matnlari yo\'q. O\'qituvchilar tez orada qo\'shadi.');
            }

            let msg = `🎯 *Talaffuz testi*\n\nO'zingizga kerakli matnni tanlang va uni o'qib bering:`;
            const buttons = [];

            words.forEach((w) => {
                const shortText = w.word.length > 25 ? w.word.substring(0, 22) + '...' : w.word;
                buttons.push([Markup.button.callback(shortText, `start_test_${w.id}`)]);
            });

            await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
        } catch (error) {
            console.error('Test Pronunciation Menu Error:', error);
            ctx.reply('Xatolik yuz berdi.');
        }
    }

    async handleStartTestById(ctx) {
        try {
            const textId = ctx.match[1];
            const word = await database.getTestWordById(textId);

            if (!word) {
                return ctx.answerCbQuery("⚠️ Matn topilmadi.", { show_alert: true });
            }

            ctx.session = ctx.session || {};
            // State'ni hali o'rnatmaymiz, faqat matnni saqlaymiz
            ctx.session.testWord = word.word;

            const isLong = word.word.trim().split(/\s+/).length > 2;
            const typeText = isLong ? 'matnni' : 'so\'zni';

            const msg = `🎯 *Talaffuz testi!*\n\nSiz tanlagan ${typeText}:\n\n👉 *${word.word}*\n\nTayyor bo'lsangiz, "O'qish" tugmasini bosing:`;

            await ctx.editMessageText(msg, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🎙 O\'qish', 'confirm_test_reading')],
                    [Markup.button.callback('🔊 Eshitish', 'listen_test_text')],
                    [Markup.button.callback('🔙 Orqaga', 'test_pronunciation_list')]
                ])
            });
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Start Test By Id Error:', error);
            await ctx.answerCbQuery('Xatolik yuz berdi.');
        }
    }

    async handleConfirmTestReading(ctx) {
        try {
            const text = ctx.session?.testWord;
            if (!text) {
                return ctx.answerCbQuery("⚠️ Xatolik: Matn topilmadi.", { show_alert: true });
            }

            ctx.session.state = 'waiting_for_test_audio';

            await ctx.editMessageText(`🎙 *Sizning navbatingiz!*\n\nMatn: *${text}*\n\nIltimos, audioni yozib yuboring...`, { parse_mode: 'Markdown' });
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Confirm Test Reading Error:', error);
            await ctx.answerCbQuery('Xatolik yuz berdi.');
        }
    }

    async handleTestPronunciationList(ctx) {
        try {
            const words = await database.getRecentTestWords(10);
            if (!words || words.length === 0) {
                return ctx.editMessageText('Hozircha test matnlari yo\'q.');
            }

            let msg = `🎯 *Talaffuz testi*\n\nO'zingizga kerakli matnni tanlang va uni o'qib bering:`;
            const buttons = [];

            words.forEach((w) => {
                const shortText = w.word.length > 25 ? w.word.substring(0, 22) + '...' : w.word;
                buttons.push([Markup.button.callback(shortText, `start_test_${w.id}`)]);
            });

            await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Test Pronunciation List Error:', error);
            await ctx.answerCbQuery('Xatolik yuz berdi.');
        }
    }

    async handleListenTestText(ctx) {
        try {
            const text = ctx.session?.testWord;
            if (!text) {
                return ctx.answerCbQuery("⚠️ Matn topilmadi. Iltimos, qaytadan boshlang.", { show_alert: true });
            }

            await ctx.answerCbQuery("Audio tayyorlanmoqda... ⏳");
            const audioPath = await ttsService.generateAudio(text, 'en');

            await ctx.reply(`🔊 *Namuna:*\n\n_"${text}"_`, { parse_mode: 'Markdown' });
            await ctx.replyWithAudio({ source: audioPath });

            await ttsService.cleanup(audioPath);
        } catch (error) {
            console.error('Listen Test Text Error:', error);
            await ctx.reply("Audioni yaratishda xatolik yuz berdi.");
        }
    }

    async handleManageTexts(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        try {
            return this.renderTextsPage(ctx, 0, 'word');
        } catch (err) {
            console.error('Manage Texts Error:', err);
            ctx.reply('Xatolik yuz berdi.');
        }
    }

    async handleDeleteText(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        const textId = ctx.match[1];
        try {
            await database.deleteTestWord(textId);
            await ctx.answerCbQuery('Matn muvaffaqiyatli o\'chirildi!');
            const page = ctx.session?.textsPage || 0;
            return this.renderTextsPage(ctx, page);
        } catch (err) {
            console.error('Delete Text Error:', err);
            await ctx.answerCbQuery('O\'chirishda xatolik yuz berdi.');
        }
    }

    async renderTextsPage(ctx, page = 0, type = 'word') {
        const rows = await database.getRecentTestWordsByType(type, 50);
        if (!rows || rows.length === 0) {
            if (ctx.callbackQuery) {
                await ctx.editMessageText(`Hozircha ${type === 'word' ? 'so\'zlar' : 'matnlar'} mavjud emas.`).catch(async () => {
                    await ctx.reply(`Hozircha ${type === 'word' ? 'so\'zlar' : 'matnlar'} mavjud emas.`);
                });
                await ctx.answerCbQuery().catch(() => { });
                return;
            }
            return ctx.reply(`Hozircha ${type === 'word' ? 'so\'zlar' : 'matnlar'} mavjud emas.`);
        }
        const pageSize = 10;
        const start = page * pageSize;
        const pageItems = rows.slice(start, start + pageSize);
        if (!ctx.session) ctx.session = {};
        ctx.session.textsPage = page;
        ctx.session.textsType = type;
        let msg = `📚 *${type === 'word' ? 'So\'zlar' : 'Matnlar'} ro'yxati*\n\n`;
        pageItems.forEach((r, i) => {
            const idx = start + i + 1;
            msg += `${idx}. ${r.word}\n`;
        });
        const buttons = [];
        const tabs = [
            Markup.button.callback(`${type === 'word' ? '✅ ' : ''}🔤 So'zlar`, 'texts_type_word'),
            Markup.button.callback(`${type === 'text' ? '✅ ' : ''}📝 Matnlar`, 'texts_type_text')
        ];
        buttons.push(tabs);
        const row1 = [];
        const row2 = [];
        pageItems.slice(0, 5).forEach((r, i) => {
            row1.push(Markup.button.callback(`${i + 1}`, `delete_text_${r.id}`));
        });
        pageItems.slice(5, 10).forEach((r, i) => {
            row2.push(Markup.button.callback(`${i + 6}`, `delete_text_${r.id}`));
        });
        if (row1.length) buttons.push(row1);
        if (row2.length) buttons.push(row2);
        const controls = [];
        controls.push(Markup.button.callback('⬅️', `texts_page_${page - 1}`));
        controls.push(Markup.button.callback('❌', 'cancel_texts_mgmt'));
        controls.push(Markup.button.callback('➡️', `texts_page_${page + 1}`));
        buttons.push(controls);
        const keyboard = Markup.inlineKeyboard(buttons);
        if (ctx.callbackQuery) {
            await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard }).catch(async () => {
                await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
            });
            await ctx.answerCbQuery().catch(() => { });
        } else {
            await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
        }
    }

    async handleTextsPage(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;
        const pageStr = ctx.match[1];
        let page = parseInt(pageStr, 10);
        if (isNaN(page) || page < 0) page = 0;
        const type = ctx.session?.textsType || 'word';
        return this.renderTextsPage(ctx, page, type);
    }

    async handleTextsType(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;
        const type = ctx.callbackQuery.data === 'texts_type_text' ? 'text' : 'word';
        if (!ctx.session) ctx.session = {};
        ctx.session.textsType = type;
        return this.renderTextsPage(ctx, 0, type);
    }

    async handleCancelTexts(ctx) {
        await ctx.answerCbQuery().catch(() => { });
        await ctx.deleteMessage().catch(() => { });
    }

    async handleCompareTextAudio(ctx) {
        const compareMenu = Markup.inlineKeyboard([
            [Markup.button.callback('🔤 So\'z yuborish', 'compare_choice_word')],
            [Markup.button.callback('📝 Matn yuborish', 'compare_choice_text')]
        ]);

        await ctx.reply('📝 Matn va Audio taqqoslash!\n\nIltimos, turini tanlang:', compareMenu);
    }

    async handleCompareChoice(ctx) {
        const choice = ctx.callbackQuery.data;
        ctx.session = ctx.session || {};

        if (choice === 'compare_choice_word') {
            ctx.session.state = 'waiting_for_compare_word';
            await ctx.editMessageText('🔤 Iltimos, so\'zni yuboring (maksimal 2 ta so\'z):');
        } else if (choice === 'compare_choice_text') {
            ctx.session.state = 'waiting_for_compare_text_long';
            await ctx.editMessageText('📝 Iltimos, matnni yuboring (3 ta va undan ko\'p so\'z):');
        }
        await ctx.answerCbQuery();
    }

    async handleTextToAudio(ctx) {
        ctx.session = ctx.session || {};
        ctx.session.state = 'waiting_for_tts_text';
        await ctx.reply('🔊 Matnni audioga o\'tkazish!\n\nIltimos, matnni yozing. Keyin ovoz jinsini tanlaysiz (Erkak / Ayol).');
    }

    async handleTtsVoiceSelect(ctx) {
        const voice = ctx.callbackQuery.data === 'tts_voice_male' ? 'male' : 'female';
        const text = ctx.session?.ttsText;

        if (!text) {
            await ctx.answerCbQuery('Matn topilmadi. Iltimos, qaytadan yuboring.', { show_alert: true });
            return;
        }

        try {
            await database.setUserVoice(ctx.from.id, voice);
        } catch (e) {
            console.error('Set voice error:', e);
        }

        await ctx.editMessageText('Zo\'r, matn audioga aylantirilmoqda... ⏳').catch(async () => {
            await ctx.reply('Zo\'r, matn audioga aylantirilmoqda... ⏳');
        });

        try {
            const audioPath = await ttsService.generateAudio(text, 'en');
            await ctx.replyWithAudio({ source: audioPath });
            await ttsService.cleanup(audioPath);
            await database.incrementUsage(ctx.from.id);
        } catch (e) {
            console.error('TTS Error:', e);
            await ctx.reply('Audioni yaratishda xatolik yuz berdi.');
        } finally {
            if (ctx.session) {
                delete ctx.session.state;
                delete ctx.session.ttsText;
            }
        }
        await ctx.answerCbQuery().catch(() => { });
    }

    async handleProfile(ctx) {
        const stats = await database.getUserStats(ctx.from.id);
        const user = await database.getUserByTelegramId(ctx.from.id);
        const referralInfo = await database.getReferralInfo(ctx.from.id);

        if (!user) {
            return ctx.reply("Siz hali ro'yxatdan o'tmagansiz. Iltimos, /start buyrug'ini bosing.");
        }

        const displayName = user.first_name || ctx.from.first_name || 'Foydalanuvchi';
        let profileMsg = `👤 *Sizning profilingiz:*\n\n` +
            `👤 Ism: ${escapeHTML(displayName)}\n` +
            `🆔 ID: \`${ctx.from.id}\`\n\n` +
            `💳 *Joriy tarif:* \n`;

        if (user.is_premium) {
            const until = new Date(user.premium_until).toLocaleDateString();
            profileMsg += `💎 Premium\n`;
            profileMsg += `📅 Muddat: ${until} gacha\n\n`;
        } else {
            profileMsg += `🆓 Bepul\n`;
            profileMsg += `📅 Muddat: Cheklanmagan\n\n`;
        }

        profileMsg += `📊 *Natijalarim:*\n` +
            `• Jami foydalanish: ${stats ? stats.total_assessments : 0}\n` +
            `• O'rtacha ball: ${stats ? Math.round(stats.avg_overall) : 0}/100\n\n` +
            `📊 *Sizning limitingiz:*\n` +
            `✅ Kunlik foydalanish: ${user.used_today} / ${user.daily_limit}\n` +
            `📝 So'z limiti: ${user.word_limit || 30} so'z\n` +
            `🎁 Bonus: ${referralInfo.bonus_limit}\n\n` +
            `💬 *Admin bilan bog'lanish:* Muammo, tarif, takliflar uchun bog'lanishingiz mumkin.`;

        const buttons = [
            [Markup.button.callback('📊 Natijalarim', 'back_to_stats')],
            [Markup.button.callback('🏆 Top foydalanuvchilar', 'top_users')],
            [Markup.button.url('🔗 Admin bilan bog\'lanish', `https://t.me/${config.ADMIN_USERNAME.replace('@', '')}`)]
        ];
        await ctx.replyWithMarkdown(profileMsg, Markup.inlineKeyboard(buttons));
    }

    async handleTopUsers(ctx) {
        try {
            const top = await database.getLeaderboard(10, 1);
            if (!top || top.length === 0) {
                return ctx.reply('Hali reyting mavjud emas.');
            }
            let msg = '🏆 <b>Top foydalanuvchilar</b>\n\n';
            top.forEach((u, i) => {
                const name = escapeHTML(u.name || 'Foydalanuvchi');
                const avg = Math.round(u.avgOverall);
                const finalScore = Math.round(u.finalScore || u.avgOverall);
                msg += `${i + 1}. ${name}\n`;
                msg += `• O'rtacha ball: <b>${avg}</b>/100\n`;
                msg += `• Tahlillar: <b>${u.total}</b>\n`;
                msg += `• Umumiy ball: <b>${finalScore}</b>/100\n\n`;
            });
            const buttons = [
                [Markup.button.callback('🔄 Yangilash', 'top_users')]
            ];
            if (ctx.callbackQuery) {
                await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
            }
        } catch (e) {
            await ctx.reply('Reytingni olishda xatolik yuz berdi.');
        }
    }

    async handleUsers(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        return this.renderUsersPage(ctx, 0, 'free');
    }

    async renderUsersPage(ctx, page = 0, type = 'free') {
        const rows = await database.getUsersByTariff(type, 50);
        if (!rows || rows.length === 0) {
            const emptyMsg = `Hozircha ${type === 'premium' ? 'premium' : 'bepul'} foydalanuvchilar mavjud emas.`;
            if (ctx.callbackQuery) {
                await ctx.editMessageText(emptyMsg).catch(async () => {
                    await ctx.reply(emptyMsg);
                });
                await ctx.answerCbQuery().catch(() => { });
                return;
            }
            return ctx.reply(emptyMsg);
        }
        const pageSize = 10;
        const start = page * pageSize;
        const pageItems = rows.slice(start, start + pageSize);
        if (!ctx.session) ctx.session = {};
        ctx.session.usersPage = page;
        ctx.session.usersType = type;
        let msg = `👥 *Foydalanuvchilar ro'yxati* — ${type === 'premium' ? '💎 Premium' : '🆓 Bepul'}\n\n`;
        pageItems.forEach((u, i) => {
            const idx = start + i + 1;
            const firstName = (u.first_name || 'Foydalanuvchi').replace(/[_*`\[\]()]/g, '\\$&');
            const username = u.username ? `(@${u.username.replace(/[_*`\[\]()]/g, '\\$&')})` : "(yo'q)";
            msg += `${idx}. ${firstName} ${username} — ID: \`${u.telegram_id}\`\n`;
        });
        const buttons = [];
        const tabs = [
            Markup.button.callback(`${type === 'free' ? '✅ ' : ''}🆓 Bepul`, 'users_type_free'),
            Markup.button.callback(`${type === 'premium' ? '✅ ' : ''}💎 Premium`, 'users_type_premium')
        ];
        buttons.push(tabs);
        const row1 = [];
        const row2 = [];
        pageItems.slice(0, 5).forEach((u, i) => {
            row1.push(Markup.button.callback(`${i + 1}`, `manage_user_${u.telegram_id}`));
        });
        pageItems.slice(5, 10).forEach((u, i) => {
            row2.push(Markup.button.callback(`${i + 6}`, `manage_user_${u.telegram_id}`));
        });
        if (row1.length) buttons.push(row1);
        if (row2.length) buttons.push(row2);
        const controls = [];
        controls.push(Markup.button.callback('⬅️', `users_page_${page - 1}`));
        controls.push(Markup.button.callback('❌', 'cancel_users_mgmt'));
        controls.push(Markup.button.callback('➡️', `users_page_${page + 1}`));
        buttons.push(controls);
        const keyboard = Markup.inlineKeyboard(buttons);
        if (ctx.callbackQuery) {
            await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard }).catch(async () => {
                await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
            });
            await ctx.answerCbQuery().catch(() => { });
        } else {
            await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
        }
    }

    async handleUsersPage(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        const pageStr = ctx.match[1];
        let page = parseInt(pageStr, 10);
        if (isNaN(page) || page < 0) page = 0;
        const type = ctx.session?.usersType || 'free';
        return this.renderUsersPage(ctx, page, type);
    }

    async handleUsersType(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        const type = ctx.callbackQuery.data === 'users_type_premium' ? 'premium' : 'free';
        if (!ctx.session) ctx.session = {};
        ctx.session.usersType = type;
        return this.renderUsersPage(ctx, 0, type);
    }

    async handleCancelUsers(ctx) {
        await ctx.answerCbQuery().catch(() => { });
        await ctx.deleteMessage().catch(() => { });
    }

    async handleBroadcastRequest(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        ctx.session = ctx.session || {};
        ctx.session.broadcast = { buttons: [] };
        ctx.session.state = 'broadcast_composing';
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('➕ Tugma qo‘shish', 'broadcast_add_button')],
            [Markup.button.callback('🤖 Maxsus bot tugmasi', 'broadcast_add_bot_button')],
            [Markup.button.callback('👁️ Ko‘rish', 'broadcast_preview')],
            [Markup.button.callback('📤 Yuborish', 'broadcast_send')],
            [Markup.button.callback('❌ Bekor qilish', 'broadcast_cancel')]
        ]);
        await ctx.reply('📢 Eʼlon yaratish rejimi.\n\nXabar matnini yoki mediani yuboring.\nPastdagi tugmalar orqali tagiga tugmalar qo‘shing va yuboring.', kb);
    }

    async handleBroadcastContent(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        ctx.session = ctx.session || {};
        ctx.session.broadcast = ctx.session.broadcast || { buttons: [] };
        let content = null;
        if (ctx.message?.text) {
            content = { type: 'text', text: ctx.message.text };
        } else if (ctx.message?.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            content = { type: 'photo', file_id: photo.file_id, caption: ctx.message.caption || '' };
        } else if (ctx.message?.video) {
            content = { type: 'video', file_id: ctx.message.video.file_id, caption: ctx.message.caption || '' };
        } else if (ctx.message?.document) {
            content = { type: 'document', file_id: ctx.message.document.file_id, caption: ctx.message.caption || '' };
        } else if (ctx.message?.audio) {
            content = { type: 'audio', file_id: ctx.message.audio.file_id, caption: ctx.message.caption || '' };
        } else if (ctx.message?.voice) {
            content = { type: 'voice', file_id: ctx.message.voice.file_id, caption: '' };
        }
        if (!content) return;
        ctx.session.broadcast.content = content;
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('➕ Tugma qo‘shish', 'broadcast_add_button')],
            [Markup.button.callback('🤖 Maxsus bot tugmasi', 'broadcast_add_bot_button')],
            [Markup.button.callback('👁️ Ko‘rish', 'broadcast_preview')],
            [Markup.button.callback('📤 Yuborish', 'broadcast_send')],
            [Markup.button.callback('❌ Bekor qilish', 'broadcast_cancel')]
        ]);
        await ctx.reply('✅ Kontent saqlandi. Endi tugmalarni qo‘shing yoki yuboring.', kb);
    }

    async handleBroadcastAddButtonRequest(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        ctx.session = ctx.session || {};
        ctx.session.broadcast = ctx.session.broadcast || { buttons: [] };
        ctx.session.state = 'broadcast_waiting_button';
        await ctx.answerCbQuery().catch(() => { });
        await ctx.reply('Tugma qo‘shish: "Matn | Link" ko‘rinishida yuboring.\nMisol: Ravon AI | https://t.me/ravon_ai');
    }

    async handleBroadcastAddButtonSave(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        const text = ctx.message.text || '';
        const parts = text.split('|').map(s => s.trim());
        if (parts.length < 2) {
            return ctx.reply('Format noto‘g‘ri. Misol: Ravon AI | https://t.me/ravon_ai');
        }
        const label = parts[0];
        const url = parts[1];
        ctx.session.broadcast = ctx.session.broadcast || { buttons: [] };
        ctx.session.broadcast.buttons.push({ text: label, url });
        ctx.session.state = 'broadcast_composing';
        await ctx.reply(`Qo‘shildi: ${label} → ${url}`);
    }

    async handleBroadcastAddBotButtonRequest(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        ctx.session = ctx.session || {};
        ctx.session.broadcast = ctx.session.broadcast || { buttons: [] };
        ctx.session.state = 'broadcast_waiting_bot_button';
        await ctx.answerCbQuery().catch(() => { });
        await ctx.reply('Maxsus bot tugmasi: "Matn | @botusername | start_param" ko‘rinishida yuboring.\nMisol: Boshlash | @ravon_ai_bot | promo123');
    }

    async handleBroadcastAddBotButtonSave(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        const text = ctx.message.text || '';
        const parts = text.split('|').map(s => s.trim());
        if (parts.length < 2) {
            return ctx.reply('Format noto‘g‘ri. Misol: Boshlash | @ravon_ai_bot | promo123');
        }
        const label = parts[0];
        const username = parts[1].replace('@', '');
        const payload = parts[2] ? parts[2] : '';
        const url = payload ? `https://t.me/${username}?start=${encodeURIComponent(payload)}` : `https://t.me/${username}`;
        ctx.session.broadcast = ctx.session.broadcast || { buttons: [] };
        ctx.session.broadcast.buttons.push({ text: label, url });
        ctx.session.state = 'broadcast_composing';
        await ctx.reply(`Qo‘shildi: ${label} → ${url}`);
    }

    async handleBroadcastPreview(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        const b = ctx.session?.broadcast;
        if (!b || !b.content) {
            await ctx.answerCbQuery('Avval xabar yuboring.', { show_alert: true }).catch(() => { });
            return;
        }
        const keyboard = b.buttons && b.buttons.length > 0 ? Markup.inlineKeyboard(b.buttons.map(btn => [Markup.button.url(btn.text, btn.url)])) : undefined;
        await ctx.answerCbQuery().catch(() => { });
        if (b.content.type === 'text') {
            await ctx.reply(b.content.text, keyboard);
        } else if (b.content.type === 'photo') {
            await ctx.replyWithPhoto(b.content.file_id, { caption: b.content.caption || '', ...keyboard });
        } else if (b.content.type === 'video') {
            await ctx.replyWithVideo(b.content.file_id, { caption: b.content.caption || '', ...keyboard });
        } else if (b.content.type === 'document') {
            await ctx.replyWithDocument(b.content.file_id, { caption: b.content.caption || '', ...keyboard });
        } else if (b.content.type === 'audio') {
            await ctx.replyWithAudio(b.content.file_id, { caption: b.content.caption || '', ...keyboard });
        } else if (b.content.type === 'voice') {
            await ctx.replyWithVoice(b.content.file_id, keyboard);
        }
    }

    async handleBroadcastSend(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        const b = ctx.session?.broadcast;
        if (!b || !b.content) {
            await ctx.answerCbQuery('Avval xabar yuboring.', { show_alert: true }).catch(() => { });
            return;
        }
        const users = await database.getAllUsers();
        await ctx.answerCbQuery().catch(() => { });
        await ctx.reply(`Yuborilmoqda: ${users.length} ta foydalanuvchi`).catch(() => { });
        const keyboard = b.buttons && b.buttons.length > 0 ? { reply_markup: Markup.inlineKeyboard(b.buttons.map(btn => [Markup.button.url(btn.text, btn.url)])).reply_markup } : {};
        let successCount = 0;
        let failCount = 0;
        for (const user of users) {
            try {
                if (b.content.type === 'text') {
                    await ctx.telegram.sendMessage(user.telegram_id, b.content.text, keyboard);
                } else if (b.content.type === 'photo') {
                    await ctx.telegram.sendPhoto(user.telegram_id, b.content.file_id, { caption: b.content.caption || '', ...keyboard });
                } else if (b.content.type === 'video') {
                    await ctx.telegram.sendVideo(user.telegram_id, b.content.file_id, { caption: b.content.caption || '', ...keyboard });
                } else if (b.content.type === 'document') {
                    await ctx.telegram.sendDocument(user.telegram_id, b.content.file_id, { caption: b.content.caption || '', ...keyboard });
                } else if (b.content.type === 'audio') {
                    await ctx.telegram.sendAudio(user.telegram_id, b.content.file_id, { caption: b.content.caption || '', ...keyboard });
                } else if (b.content.type === 'voice') {
                    await ctx.telegram.sendVoice(user.telegram_id, b.content.file_id, keyboard);
                }
                successCount++;
                if (successCount % 20 === 0) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (e) {
                console.error('Broadcast send error:', e.message);
                failCount++;
            }
        }
        ctx.session.state = null;
        ctx.session.broadcast = null;
        await ctx.reply(`✅ Yakunlandi\nMuvaffaqiyatli: ${successCount}\nXato: ${failCount}`, this.adminMenu);
    }

    async handleBroadcastCancel(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;
        ctx.session.state = null;
        ctx.session.broadcast = null;
        await ctx.answerCbQuery().catch(() => { });
        await ctx.reply('Bekor qilindi.', this.adminMenu);
    }

    async handleManageUser(ctx) {
        try {
            const isAdmin = await database.isAdmin(ctx.from.id);
            if (!isAdmin) return;

            const targetId = ctx.match[1];
            const user = await database.getUserByTelegramId(targetId);

            if (!user) {
                return ctx.answerCbQuery('Foydalanuvchi topilmadi.', { show_alert: true });
            }

            const isTeacher = user.is_teacher === 1;
            const firstName = (user.first_name || 'Foydalanuvchi').replace(/[_*`\[\]()]/g, '\\$&');

            const msg = `👤 *Foydalanuvchini boshqarish:*\n\n` +
                `Ism: ${firstName}\n` +
                `ID: \`${user.telegram_id}\`\n` +
                `Rol: ${user.is_admin ? 'Admin' : (isTeacher ? 'O\'qituvchi' : 'Talaba')}\n` +
                `Limit: ${user.daily_limit}\n` +
                `So'z limiti: ${user.word_limit || 30}`;

            const buttons = [
                [Markup.button.callback(isTeacher ? '❌ O\'qituvchilikdan olish' : '👨‍🏫 O\'qituvchi etib tayinlash', `toggle_teacher_${targetId}_${isTeacher ? 0 : 1}`)],
                [Markup.button.callback('➕ Limit qo\'shish (+3)', `add_limit_${targetId}_3`)],
                [Markup.button.callback('🔙 Orqaga', 'admin_users_list')]
            ];

            await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(async (e) => {
                console.error('Error editing message in handleManageUser:', e);
                await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
            });

            await ctx.answerCbQuery().catch(() => { });
        } catch (error) {
            console.error('Error in handleManageUser:', error);
            await ctx.answerCbQuery('Xatolik yuz berdi.', { show_alert: true }).catch(() => { });
        }
    }

    async handleToggleTeacher(ctx) {
        try {
            const isAdmin = await database.isAdmin(ctx.from.id);
            if (!isAdmin) return;

            const [_, targetId, status] = ctx.match;
            const isTeacher = status === '1';

            await database.setTeacher(targetId, isTeacher);

            await ctx.answerCbQuery(isTeacher ? 'O\'qituvchi etib tayinlandi!' : 'O\'qituvchilikdan olindi!');
            return this.handleManageUser(ctx);
        } catch (error) {
            console.error('Error in handleToggleTeacher:', error);
            await ctx.answerCbQuery('Xatolik yuz berdi.', { show_alert: true }).catch(() => { });
        }
    }

    async handleAddLimit(ctx) {
        try {
            const isAdmin = await database.isAdmin(ctx.from.id);
            if (!isAdmin) return;

            const [_, targetId, amount] = ctx.match;

            const user = await database.getUserByTelegramId(targetId);

            if (user) {
                const newLimit = user.daily_limit + parseInt(amount);
                await database.updateUserLimit(targetId, newLimit);
                await ctx.answerCbQuery(`Limit ${newLimit} ga oshirildi!`);
                return this.handleManageUser(ctx);
            }
            await ctx.answerCbQuery('Foydalanuvchi topilmadi.', { show_alert: true });
        } catch (error) {
            console.error('Error in handleAddLimit:', error);
            await ctx.answerCbQuery('Xatolik yuz berdi.', { show_alert: true }).catch(() => { });
        }
    }

    async handleAddTestWord(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        ctx.session = ctx.session || {};
        ctx.session.state = 'waiting_for_new_test_word';
        await ctx.reply('➕ Yangi test so\'zini yuboring:');
    }

    async handleAiTextGeneration(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        const aiMenu = Markup.inlineKeyboard([
            [Markup.button.callback('📝 Oson gap', 'ai_generate_easy_sentence')],
            [Markup.button.callback('📝 O\'rta gap', 'ai_generate_medium_sentence')],
            [Markup.button.callback('📝 Qiyin gap', 'ai_generate_hard_sentence')],
            [Markup.button.callback('📄 Oson matn (4-5 gap)', 'ai_generate_easy_text')],
            [Markup.button.callback('📄 O\'rta matn (4-5 gap)', 'ai_generate_medium_text')],
            [Markup.button.callback('📄 Qiyin matn (4-5 gap)', 'ai_generate_hard_text')],
            [Markup.button.callback('🔙 Orqaga', 'back_to_teacher_menu')]
        ]);

        await ctx.reply('🤖 *AI yordamida matn yaratish*\n\nQanday turdagi matn yoki gap yaratmoqchisiz:', {
            parse_mode: 'Markdown',
            ...aiMenu
        });
    }

    async handleAiWordGeneration(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        const aiMenu = Markup.inlineKeyboard([
            [Markup.button.callback('🔤 Oson so\'z', 'ai_generate_easy_word')],
            [Markup.button.callback('🔤 O\'rta so\'z', 'ai_generate_medium_word')],
            [Markup.button.callback('🔤 Qiyin so\'z', 'ai_generate_hard_word')],
            [Markup.button.callback('🔙 Orqaga', 'back_to_teacher_menu')]
        ]);

        await ctx.reply('🤖 *AI yordamida so\'z yaratish*\n\nQanday darajadagi so\'z yaratmoqchisiz:', {
            parse_mode: 'Markdown',
            ...aiMenu
        });
    }

    async handleAiGenerate(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        const difficulty = ctx.match[1];
        const type = ctx.match[2];

        try {
            await ctx.answerCbQuery("AI yordamida yaratilmoqda... ⏳");

            const generatedText = await geminiService.generateTestText(difficulty, type);

            // Add to database
            await database.addTestWord(generatedText);

            const typeText = type === 'word' ? 'So\'z' : type === 'sentence' ? 'Gap' : 'Matn';
            const difficultyText = difficulty === 'easy' ? 'Oson' : difficulty === 'medium' ? 'O\'rta' : 'Qiyin';

            await ctx.reply(`✅ *AI tomonidan yaratildi*\n\n🎯 *${typeText}* (${difficultyText})\n\n"${generatedText}"\n\n✅ Matn testlar ro\'yxatiga qo\'shildi!`, {
                parse_mode: 'Markdown'
            });

        } catch (error) {
            console.error('AI generation error:', error);
            await ctx.reply('❌ AI matn yaratishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
        }
    }

    async handleMyStudents(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        try {
            const teacher = await database.getUserByTelegramId(ctx.from.id);
            if (!teacher) {
                return ctx.reply('❌ O\'qituvchi ma\'lumotlari topilmadi.');
            }
            const students = await database.getTeacherStudents(teacher.id);

            if (!students || students.length === 0) {
                const assignMenu = Markup.inlineKeyboard([
                    [Markup.button.callback('👥 O\'quvchi biriktirish', 'assign_student_menu')],
                    [Markup.button.callback('👥 Foydalanuvchidan biriktirish', 'assign_user_menu')],
                    [Markup.button.callback('📋 Ro\'yxatdan tanlash', 'show_user_selection_for_assignment')]
                ]);
                return ctx.reply('👥 *O\'quvchilarim*\n\nHozircha sizga biriktirilgan o\'quvchilar yo\'q.\n\nYangi o\'quvchi biriktirish uchun pastdagi tugmalardan birini tanlang:', {
                    parse_mode: 'Markdown',
                    ...assignMenu
                });
            }

            let msg = `👥 *O\'quvchilarim (${students.length} ta):*\n\n`;
            const buttons = [];

            students.forEach((student, index) => {
                const studentName = student.first_name || 'Noma\'lum';
                const studentUsername = student.username ? `@${student.username}` : '';
                msg += `${index + 1}. ${studentName} ${studentUsername}\n`;
                buttons.push([Markup.button.callback(`📝 Topshiriq berish: ${studentName}`, `assign_task_${student.id}`)]);
                buttons.push([Markup.button.callback(`❌ Olib tashlash: ${studentName}`, `remove_student_${student.id}`)]);
            });

            // Add option to assign new student
            buttons.push([Markup.button.callback('👥 Yangi o\'quvchi biriktirish', 'assign_student_menu')]);
            buttons.push([Markup.button.callback('👥 Foydalanuvchidan biriktirish', 'assign_user_menu')]);
            buttons.push([Markup.button.callback('📋 Ro\'yxatdan tanlash', 'show_user_selection_for_assignment')]);

            await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
        } catch (error) {
            console.error('My students error:', error);
            await ctx.reply('O\'quvchilar ro\'yxatini yuklashda xatolik yuz berdi.');
        }
    }

    async handleAssignUserMenu(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        ctx.session = ctx.session || {};
        ctx.session.state = 'waiting_for_user_assignment';

        await ctx.reply(
            '👥 *Foydalanuvchidan biriktirish*\n\n' +
            'Iltimos, biriktirmoqchi bo\'lgan foydalanuvchining Telegram ID sini yuboring.\n\n' +
            '*Qanday qilib topish mumkin:*\n' +
            '1. Foydalanuvchi botdan "/start" buyrug\'ini bosing\n' +
            '2. Foydalanuvchi o\'z profilini ochadi\n' +
            '3. Foydalanuvchi ID sini ko\'radi (masalan: 123456789)\n\n' +
            '📝 *Foydalanuvchi ID sini kiriting:*',
            { parse_mode: 'Markdown' }
        );
    }

    async handleUserSelectionForAssignment(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        try {
            const users = await database.getAllUsers();
            let msg = `👥 *O'quvchi biriktirish uchun foydalanuvchilar ro'yxati:*\n\n`;

            const inlineKeyboard = [];

            // Filter out teachers and admins, show only regular users
            const regularUsers = users.filter(u => u.is_teacher !== 1 && u.is_admin !== 1 && u.telegram_id !== ctx.from.id);

            if (regularUsers.length === 0) {
                return ctx.reply('❌ Biriktirish uchun mavjud foydalanuvchilar topilmadi.');
            }

            regularUsers.slice(0, 15).forEach(u => {
                const firstName = (u.first_name || 'Foydalanuvchi').replace(/[_*`\[\]()]/g, '\\$&');
                const username = u.username ? `(@${u.username.replace(/[_*`\[\]()]/g, '\\$&')})` : "(yo'q)";
                msg += `• ${firstName} ${username} - ID: \`${u.telegram_id}\`\n`;
                inlineKeyboard.push([Markup.button.callback(`➕ ${u.first_name || 'Foydalanuvchi'} ni o'quvchi qilish`, `select_user_for_student_${u.telegram_id}`)]);
            });

            if (regularUsers.length > 15) {
                msg += `\n...va yana ${regularUsers.length - 15} ta foydalanuvchi.`;
            }

            msg += `\n\n👆 Yuqoridan o'zingizga kerakli foydalanuvchini tanlang.`;

            if (ctx.callbackQuery) {
                await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineKeyboard) }).catch(e => {
                    console.error('Error editing message in handleUserSelectionForAssignment:', e);
                    ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(inlineKeyboard));
                });
                try {
                    await ctx.answerCbQuery();
                } catch (e) { }
            } else {
                await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(inlineKeyboard)).catch(e => {
                    console.error('Error replying in handleUserSelectionForAssignment:', e);
                    ctx.reply(msg.replace(/[*_`]/g, ''));
                });
            }
        } catch (error) {
            console.error('Error in handleUserSelectionForAssignment:', error);
            await ctx.reply('Foydalanuvchilar ro\'yxatini yuklashda xatolik yuz berdi.');
        }
    }

    async handleUserAssignmentProcessing(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        if (ctx.session?.state === 'waiting_for_user_assignment') {
            const userTelegramId = ctx.message.text.trim();

            if (!userTelegramId || isNaN(userTelegramId)) {
                return ctx.reply('❌ Noto\'g\'ri Telegram ID. Iltimos, faqat raqam kiriting.');
            }

            try {
                const user = await database.getUserByTelegramId(parseInt(userTelegramId));

                if (!user) {
                    return ctx.reply('❌ Bu ID ga ega bo\'lgan foydalanuvchi topilmadi. Iltimos, foydalanuvchi avval botdan "/start" buyrug\'ini borganligini tekshiring.');
                }

                // Check if user is already a teacher or admin
                if (user.is_teacher === 1 || user.is_admin === 1) {
                    return ctx.reply('❌ Ushbu foydalanuvchi allaqach o\'qituvchi yoki admin. Boshqa foydalanuvchini tanlang.');
                }

                const teacher = await database.getUserByTelegramId(ctx.from.id);
                if (!teacher) {
                    return ctx.reply('❌ O\'qituvchi ma\'lumotlari topilmadi.');
                }
                const teacherId = teacher.id;
                const userId = user.id;

                await database.assignStudentToTeacher(teacherId, userId);

                // Clear session
                delete ctx.session.state;

                await ctx.reply(
                    `✅ *Foydalanuvchi muvaffaqiyatli biriktirildi!*\n\n` +
                    `👤 Foydalanuvchi: ${user.first_name}\n` +
                    `🆔 Telegram ID: ${user.telegram_id}\n` +
                    `👥 Username: ${user.username ? '@' + user.username : 'yo\'q'}\n` +
                    `🎯 Rol: ${user.is_teacher ? 'O\'qituvchi' : 'O\'quvchi'}\n\n` +
                    `Endi ushbu foydalanuvchiga "👥 O\'quvchilarim" bo\'limidan topshiriq berishingiz mumkin.`,
                    { parse_mode: 'Markdown' }
                );

                // Notify user
                try {
                    await ctx.telegram.sendMessage(
                        user.telegram_id,
                        `🎉 *Siz o\'qituvchiga biriktirildingiz!*\n\n` +
                        `👨‍🏫 O\'qituvchi: ${ctx.from.first_name}\n\n` +
                        `Endi o\'qituvchingiz sizga topshiriqlar berishi mumkin. "📊 Mening natijalarim" bo\'limidan yangi topshiriqlarni tekshiring.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (notifyError) {
                    console.error('Failed to notify user:', notifyError);
                }

            } catch (error) {
                console.error('User assignment error:', error);
                await ctx.reply('❌ Foydalanuvchini biriktirishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
            }
            return;
        }
    }

    async handleAssignStudentMenu(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        ctx.session = ctx.session || {};
        ctx.session.state = 'waiting_for_student_assignment';

        await ctx.reply(
            '👥 *O\'quvchi biriktirish*\n\n' +
            'Iltimos, o\'quvchining Telegram ID sini yuboring.\n\n' +
            '*Qanday qilib topish mumkin:*\n' +
            '1. O\'quvchi botdan "/start" buyrug\'ini bosing\n' +
            '2. O\'quvchi o\'z profilini ochadi\n' +
            '3. O\'quvchi ID sini ko\'radi (masalan: 123456789)\n\n' +
            '📝 *O\'quvchi ID sini kiriting:*',
            { parse_mode: 'Markdown' }
        );
    }

    async handleStudentAssignmentProcessing(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        if (ctx.session?.state === 'waiting_for_student_assignment') {
            const studentTelegramId = ctx.message.text.trim();

            if (!studentTelegramId || isNaN(studentTelegramId)) {
                return ctx.reply('❌ Noto\'g\'ri Telegram ID. Iltimos, faqat raqam kiriting.');
            }

            try {
                const student = await database.getUserByTelegramId(parseInt(studentTelegramId));

                if (!student) {
                    return ctx.reply('❌ Bu ID ga ega bo\'lgan foydalanuvchi topilmadi. Iltimos, o\'quvchi avval botdan "/start" buyrug\'ini borganligini tekshiring.');
                }

                const teacher = await database.getUserByTelegramId(ctx.from.id);
                if (!teacher) {
                    return ctx.reply('❌ O\'qituvchi ma\'lumotlari topilmadi.');
                }
                const teacherId = teacher.id;
                const studentId = student.id;

                await database.assignStudentToTeacher(teacherId, studentId);

                // Clear session
                delete ctx.session.state;

                await ctx.reply(
                    `✅ *O\'quvchi muvaffaqiyatli biriktirildi!*\n\n` +
                    `👤 O\'quvchi: ${student.first_name}\n` +
                    `🆔 Telegram ID: ${student.telegram_id}\n` +
                    `👥 Username: ${student.username ? '@' + student.username : 'yo\'q'}\n\n` +
                    `Endi ushbu o\'quvchiga "👥 O\'quvchilarim" bo\'limidan topshiriq berishingiz mumkin.`,
                    { parse_mode: 'Markdown' }
                );

                // Notify student
                try {
                    await ctx.telegram.sendMessage(
                        student.telegram_id,
                        `🎉 *Siz o\'qituvchiga biriktirildingiz!*\n\n` +
                        `👨‍🏫 O\'qituvchi: ${ctx.from.first_name}\n\n` +
                        `Endi o\'qituvchingiz sizga topshiriqlar berishi mumkin. "📊 Mening natijalarim" bo\'limidan yangi topshiriqlarni tekshiring.`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (notifyError) {
                    console.error('Failed to notify student:', notifyError);
                }

            } catch (error) {
                console.error('Student assignment error:', error);
                await ctx.reply('❌ O\'quvchini biriktirishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
            }
            return;
        }
    }

    async handleUserSelectionForAssignmentCallback(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        // Ensure session exists
        if (!ctx.session) {
            ctx.session = {};
        }

        const userTelegramId = ctx.match[1];

        try {
            const user = await database.getUserByTelegramId(parseInt(userTelegramId));

            if (!user) {
                return ctx.answerCbQuery('❌ Foydalanuvchi topilmadi.', { show_alert: true });
            }

            // Check if user is already a teacher or admin
            if (user.is_teacher === 1 || user.is_admin === 1) {
                return ctx.answerCbQuery('❌ Ushbu foydalanuvchi allaqachon o\'qituvchi yoki admin. Boshqa foydalanuvchini tanlang.', { show_alert: true });
            }

            const teacher = await database.getUserByTelegramId(ctx.from.id);
            if (!teacher) {
                return ctx.answerCbQuery('❌ O\'qituvchi ma\'lumotlari topilmadi.', { show_alert: true });
            }
            const teacherId = teacher.id;
            const userId = user.id;

            await database.assignStudentToTeacher(teacherId, userId);

            await ctx.answerCbQuery('✅ Foydalanuvchi muvaffaqiyatli biriktirildi!');

            // Show success message and refresh the list
            await ctx.editMessageText(
                `✅ *Foydalanuvchi muvaffaqiyatli biriktirildi!*\n\n` +
                `👤 Foydalanuvchi: ${user.first_name}\n` +
                `🆔 Telegram ID: ${user.telegram_id}\n` +
                `👥 Username: ${user.username ? '@' + user.username : 'yo\'q'}\n\n` +
                `Endi ushbu foydalanuvchiga "👥 O'quvchilarim" bo'limidan topshiriq berishingiz mumkin.\n\n` +
                `🔄 Ro'yxatni yangilash uchun "👥 O'quvchilarim" tugmasini bosing.`,
                { parse_mode: 'Markdown' }
            );

            // Notify user
            try {
                await ctx.telegram.sendMessage(
                    user.telegram_id,
                    `🎉 *Siz o\'qituvchiga biriktirildingiz!*\n\n` +
                    `👨‍🏫 O\'qituvchi: ${ctx.from.first_name}\n\n` +
                    `Endi o\'qituvchingiz sizga topshiriqlar berishi mumkin. "📊 Mening natijalarim" bo\'limidan yangi topshiriqlarni tekshiring.`,
                    { parse_mode: 'Markdown' }
                );
            } catch (notifyError) {
                console.error('Failed to notify user:', notifyError);
            }

        } catch (error) {
            console.error('User selection assignment error:', error);
            await ctx.answerCbQuery('❌ Foydalanuvchini biriktirishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.', { show_alert: true });
        }
    }

    async handleAssignTask(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        const studentId = ctx.match[1];

        try {
            const student = await database.getUserById(studentId);

            if (!student) {
                return ctx.answerCbQuery('O\'quvchi topilmadi.', { show_alert: true });
            }

            ctx.session = ctx.session || {};
            ctx.session.assigningTaskTo = studentId;
            ctx.session.state = 'waiting_for_task_text';

            await ctx.editMessageText(
                `📝 *Topshiriq berish*\n\n` +
                `O\'quvchi: ${student.first_name}\n\n` +
                `Iltimos, topshiriq matnini yuboring:\n\n` +
                `*Misol:*\n` +
                `• "Hello world"\n` +
                `• "The weather is nice today"\n` +
                `• "I love learning English"`,
                { parse_mode: 'Markdown' }
            );
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Assign task error:', error);
            await ctx.answerCbQuery('Xatolik yuz berdi.', { show_alert: true });
        }
    }

    async handleRemoveStudent(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        const studentId = ctx.match[1];

        try {
            const student = await database.getUserById(studentId);

            if (!student) {
                return ctx.answerCbQuery('O\'quvchi topilmadi.', { show_alert: true });
            }

            // Ask for confirmation before removing
            await ctx.editMessageText(
                `❌ *O\'quvchini olib tashlashni tasdiqlang*\n\n` +
                `👤 O\'quvchi: ${student.first_name}\n` +
                `🆔 Telegram ID: ${student.telegram_id}\n\n` +
                `Ushbu o\'quvchini olib tashlashingizga ishonchingizmi?`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ Ha, olib tashlash', `confirm_remove_${student.id}`)],
                        [Markup.button.callback('❌ Yo\'m, bekor qilish', 'cancel_remove')]
                    ])
                }
            );
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Remove student error:', error);
            await ctx.answerCbQuery('O\'quvchini olib tashlashda xatolik yuz berdi.', { show_alert: true });
        }
    }

    async handleConfirmRemoveStudent(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        const studentId = ctx.match[1];

        try {
            await database.removeStudentFromTeacher(ctx.from.id, studentId);
            await ctx.answerCbQuery('O\'quvchi muvaffaqiyatli olib tashlandi!');

            // Refresh students list
            return this.handleMyStudents(ctx);
        } catch (error) {
            console.error('Confirm remove student error:', error);
            await ctx.answerCbQuery('O\'quvchini olib tashlashda xatolik yuz berdi.', { show_alert: true });
        }
    }

    async handleCancelRemoveStudent(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        await ctx.answerCbQuery('Bekor qilindi.');

        // Refresh students list
        return this.handleMyStudents(ctx);
    }

    async handleMyTasks(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        try {
            const teacher = await database.getUserByTelegramId(ctx.from.id);
            if (!teacher) {
                return ctx.reply('❌ O\'qituvchi ma\'lumotlari topilmadi.');
            }
            const tasks = await database.getTeacherTasks(teacher.id);

            if (!tasks || tasks.length === 0) {
                return ctx.reply('📋 *Topshiriqlarim*\n\nHozircha topshiriqlar yo\'q.', { parse_mode: 'Markdown' });
            }

            let msg = `📋 *Topshiriqlarim (${tasks.length} ta):*\n\n`;

            tasks.forEach((task, index) => {
                const statusIcon = task.status === 'pending' ? '⏳' : task.status === 'submitted' ? '✅' : '✅';
                const studentName = task.student_name || 'Noma\'lum';
                const scoreText = task.overall_score !== null ? ` (${task.overall_score} ball)` : '';
                msg += `${index + 1}. ${statusIcon} ${studentName}${scoreText}\n`;
                msg += `   📝 "${task.task_text.substring(0, 30)}..."\n`;
                msg += `   📅 ${task.created_at.split(' ')[0]}\n\n`;
            });

            await ctx.replyWithMarkdown(msg);
        } catch (error) {
            console.error('My tasks error:', error);
            await ctx.reply('Topshiriqlar ro\'yxatini yuklashda xatolik yuz berdi.');
        }
    }

    async handleTestWord(ctx) {
        return this.handleAddTestWord(ctx);
    }

    async handleTaskTextProcessing(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        if (ctx.session?.state === 'waiting_for_task_text' && ctx.session.assigningTaskTo) {
            const taskText = ctx.message.text.trim();

            if (!taskText) {
                return ctx.reply('❌ Topshiriq matni bo\'sh bo\'lishi mumkin emas. Iltimos, qayta yuboring.');
            }

            try {
                const teacher = await database.getUserByTelegramId(ctx.from.id);
                if (!teacher) {
                    return ctx.reply('❌ O\'qituvchi ma\'lumotlari topilmadi.');
                }
                const teacherId = teacher.id; // Database ID
                const studentId = ctx.session.assigningTaskTo; // Already Database ID

                const taskId = await database.createTask(teacherId, studentId, taskText);

                // Get student info for notification
                const student = await database.getUserById(studentId);

                // Clear session
                delete ctx.session.state;
                delete ctx.session.assigningTaskTo;

                await ctx.reply(`✅ *Topshiriq muvaffaqiyatli yaratildi!*\n\n📝 "${taskText}"\n👤 O\'quvchi: ${student.first_name}\n\nO\'quvchi topshiriqni "📊 Mening natijalarim" bo\'limida ko\'radi.`, {
                    parse_mode: 'Markdown'
                });

                // Notify student
                try {
                    await ctx.telegram.sendMessage(
                        student.telegram_id,
                        `📝 *Yangi topshiriq!*\n\n` +
                        `👨‍🏫 O\'qituvchingiz sizga yangi topshiriq yubordi:\n\n` +
                        `📝 "${taskText}"\n\n` +
                        `Topshiriqni bajarish uchun pastdagi tugmalardan foydalaning:`,
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('🎯 Bajarish', `start_task_${taskId}`)],
                                [Markup.button.callback('📊 Mening natijalarim', 'view_my_tasks')]
                            ])
                        }
                    );
                } catch (notifyError) {
                    console.error('Failed to notify student:', notifyError);
                }

            } catch (error) {
                console.error('Task creation error:', error);
                await ctx.reply('❌ Topshiriq yaratishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
            }
            return;
        }
    }

    async handleAdminStats(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        try {
            const stats = await database.getGeneralStats();

            const msg = `📊 *Umumiy statistika:*\n\n` +
                `👥 Jami foydalanuvchilar: ${stats.total_users}\n` +
                `📝 Jami tahlillar: ${stats.total_assessments}\n` +
                `🎯 Jami test so'zlari: ${stats.total_words}`;

            await ctx.replyWithMarkdown(msg);
        } catch (error) {
            console.error('Error in handleAdminStats:', error);
            ctx.reply('Statistikani yuklashda xatolik.');
        }
    }

    async handleAdminStatsOnly(ctx) {
        return this.handleAdminStats(ctx);
    }

    async handleUserResults(ctx) {
        const isTeacher = await database.isTeacher(ctx.from.id);
        if (!isTeacher) return;

        try {
            const rows = await database.getRecentAssessments(10);

            let msg = `📋 *Oxirgi 10 ta natija:*\n\n`;
            rows.forEach(r => {
                msg += `• ${r.first_name} | ${r.type} | Ball: ${r.overall_score}\n`;
            });
            ctx.replyWithMarkdown(msg);
        } catch (error) {
            console.error('Error in handleUserResults:', error);
            ctx.reply('Natijalarni yuklashda xato.');
        }
    }

    async handleHelp(ctx) {
        const helpMessage = `🤖 *Botdan qanday foydalanish mumkin?*\n\n` +
            `🎯 **Ravon AI — Talaffuzingizni mukammallashtiring!**\n\n` +
            `Assalomu alaykum! Ingliz tilida ravon gapirishni biz bilan o'rganing.\n\n` +
            `**Bot imkoniyatlari:**\n\n` +
            `✅ **Talaffuzni tekshirish:** Nutqingizni ovozli xabar orqali yuboring va xatolarni aniqlang.\n` +
            `✅ **Matnni audioga o'tkazish:** Har qanday matnni to'g'ri talaffuzda eshiting.\n` +
            `✅ **PDF tahlil:** Nutqingiz natijalarini professional PDF hisobot ko'rinishida oling.\n\n` +
            `🎁 **Siz uchun 3 ta bepul imkoniyat tayyor!**\n\n` +
            `👇 Hoziroq /start tugmasini bosing va nutqingizni sinab ko'ring!`;

        await ctx.replyWithMarkdown(helpMessage);
    }

    async handleTariffPlan(ctx) {
        const user = await database.getUserByTelegramId(ctx.from.id);
        const tariffs = await database.getTariffs();
        const cardNum = await database.getSetting('card_number');
        const cardHolder = await database.getSetting('card_holder') || '';

        if (tariffs.length === 0) {
            return ctx.reply("⚠️ Hozirda faol tariflar mavjud emas. Iltimos, keyinroq urinib ko'ring.");
        }

        let msg = `💰 *Tarif rejalari*\n\n`;

        // Show current tariff
        if (user.is_premium) {
            const until = new Date(user.premium_until).toLocaleDateString();
            msg += `✅ *Sizning joriy tarifingiz:* Premium 💎\n`;
            msg += `� Amal qilish muddati: ${until} gacha\n\n`;
        } else {
            msg += `🆓 *Sizning joriy tarifingiz:* Bepul (Free)\n`;
            msg += `ℹ️ Premium tarifga o'tib, kunlik limitlarni oshirishingiz mumkin.\n\n`;
        }

        msg += `📋 *Mavjud tariflar:*\n`;

        tariffs.forEach(t => {
            msg += `\n*${t.name}*:\n`;
            msg += `• Narxi: ${t.price.toLocaleString()} so'm\n`;
            msg += `• Muddati: ${t.duration_days} kun\n`;
            msg += `• Kunlik limit: ${t.limit_per_day} ta\n`;
            msg += `• So'z limiti: ${t.word_limit} ta gacha\n`;
        });

        msg += `\n� *To'lov qilish tartibi:*\n`;
        msg += `1. O'zingizga ma'qul tarif ostidagi 'Sotib olish' tugmasini bosing.\n`;
        msg += `2. Yuqoridagi karta raqamiga tarif narxini o'tkazing.\n`;
        msg += `3. To'lov chekini (rasm/screenshot) botga yuboring.\n\n`;

        if (cardNum) {
            msg += `💳 Karta: \`${cardNum}\`\n`;
            if (cardHolder) msg += `👤 Ega: ${cardHolder}\n`;
        }

        const buttons = tariffs.map(t => [Markup.button.callback(`Sotib olish: ${t.name}`, `select_tariff_${t.id}`)]);
        buttons.push([Markup.button.callback('🎁 Bepul limit olish', 'show_referral_info')]);
        const keyboard = Markup.inlineKeyboard(buttons);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard }).catch(() => { });
            await ctx.answerCbQuery();
        } else {
            await ctx.replyWithMarkdown(msg, keyboard);
        }
    }

    async handleHowItWorks(ctx) {
        const msg =
            "❓ Bot qanday ishlaydi?\n\n" +
            "1) 🎙 Talaffuzni tekshirish:\n" +
            "   • Matn yozing yoki tasodifiy matn tanlang\n" +
            "   • So‘ng audioni yuboring va tahlil natijasini oling\n\n" +
            "2) 🔊 Matnni ovozga aylantirish:\n" +
            "   • Matn yuboring va tayyor audio faylni qabul qiling\n\n" +
            "3) 👤 Profil:\n" +
            "   • Tarifingiz, cheklovlar va umumiy statistika\n\n" +
            "4) 💳 Tariflar | Ko‘proq foyda olish:\n" +
            "   • Tariflarni ko‘ring, sotib oling yoki referal orqali bepul limit oling";
        const buttons = [
            [Markup.button.url('🎥 Video qo‘llanma', config.CHANNEL_URL)]
        ];
        await ctx.reply(msg, { ...Markup.inlineKeyboard(buttons) });
    }

    async handleSelectTariff(ctx) {
        const tariffId = ctx.match[1];
        const tariffs = await database.getTariffs();
        const tariff = tariffs.find(t => t.id == tariffId);

        if (!tariff) return ctx.answerCbQuery("Tarif topilmadi.");

        ctx.session.selectedTariff = tariff;
        ctx.session.state = 'waiting_for_payment_details';

        await ctx.reply(`✅ Siz *${tariff.name}* tarifini tanladingiz.\n\n` +
            `Iltimos, endi to'lov chekini (rasm/screenshot) yuboring.\n` +
            `Rasm bilan birga izohda quyidagilarni yozing:\n` +
            `1. Ism va familiyangiz\n` +
            `2. Qaysi kartadan pul o'tkazilgani (oxirgi 4 raqami)`, { parse_mode: 'Markdown' });

        await ctx.answerCbQuery();
    }

    // --- Admin Settings ---
    async handleCardSettings(ctx) {
        try {
            console.log('handleCardSettings called by:', ctx.from.id);
            const isAdmin = await database.isAdmin(ctx.from.id);
            console.log('Is admin:', isAdmin);
            if (!isAdmin) {
                console.log('User is not admin, returning');
                return;
            }

            const cardNum = await database.getSetting('card_number');
            const cardHolder = await database.getSetting('card_holder');
            console.log('Card data:', { cardNum, cardHolder });

            let msg = `💳 *Karta Sozlamalari*\n\n`;
            msg += `Hozirgi karta: \`${cardNum || 'yo\'q'}\`\n`;
            msg += `Karta egasi: \`${cardHolder || 'yo\'q'}\`\n\n`;
            msg += `O'zgartirish uchun quyidagi tugmani bosing:`;

            const buttons = [
                [Markup.button.callback('✏️ Kartani o\'zgartirish', 'admin_set_card')],
                [Markup.button.callback('🔙 Orqaga', 'admin_panel_main')]
            ];

            if (ctx.callbackQuery) {
                await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(() => { });
            } else {
                await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
            }
        } catch (error) {
            console.error('Error in handleCardSettings:', error);
            await ctx.reply('Xatolik yuz berdi.');
        }
    }

    async handleSetCardRequest(ctx) {
        console.log('handleSetCardRequest called by:', ctx.from.id);
        const isAdmin = await database.isAdmin(ctx.from.id);
        console.log('Is admin:', isAdmin);
        if (!isAdmin) {
            console.log('User is not admin, returning');
            return;
        }

        // Ensure session exists
        if (!ctx.session) {
            ctx.session = {};
        }

        ctx.session.state = 'waiting_for_card_info';
        console.log('Session state set to waiting_for_card_info');

        await ctx.reply('💳 Yangi karta ma\'lumotlarini quyidagi formatda yuboring:\n\n`KARTA_RAKAMI KARTA_EGASI`\n\nMisol: `8600123456789012 Eshmat Toshmatov`\n\nBekor qilish uchun /cancel deb yozing.', { parse_mode: 'Markdown' });
        await safeAnswerCbQuery(ctx);
    }

    async handleSetCard(ctx) {
        console.log('handleSetCard called by:', ctx.from.id);
        console.log('Session state:', ctx.session?.state);

        const isAdmin = await database.isAdmin(ctx.from.id);
        console.log('Is admin:', isAdmin);
        if (!isAdmin) {
            console.log('User is not admin, returning');
            return;
        }

        const text = ctx.message.text;
        console.log('Received text:', text);

        if (text === '/cancel') {
            // Ensure session exists before clearing
            if (ctx.session) {
                ctx.session.state = null;
            }
            return ctx.reply('Bekor qilindi.', this.adminMenu);
        }

        // Split by space but handle multiple spaces
        const parts = text.trim().split(/\s+/);
        console.log('Text parts:', parts);

        if (parts.length < 2) {
            console.log('Invalid format - parts length:', parts.length);
            return ctx.reply("❌ Format noto'g'ri. Iltimos, karta raqami va egasini yozing.\n\nMisol: `8600123456789012 Eshmat Toshmatov`", { parse_mode: 'Markdown' });
        }

        const cardNum = parts[0];
        const cardHolder = parts.slice(1).join(' ');
        console.log('Card to save:', { cardNum, cardHolder });

        try {
            await database.setSetting('card_number', cardNum);
            await database.setSetting('card_holder', cardHolder);
            console.log('Card saved successfully');
        } catch (error) {
            console.error('Error saving card:', error);
            return ctx.reply('❌ Karta saqlashda xatolik yuz berdi.');
        }

        // Clear session state safely
        if (ctx.session) {
            ctx.session.state = null;
        }

        await ctx.reply(`✅ Karta muvaffaqiyatli saqlandi:\n\n💳 Karta: \`${cardNum}\`\n👤 Ega: \`${cardHolder}\``, { parse_mode: 'Markdown', ...this.adminMenu });
    }

    async handleTariffSettings(ctx) {
        try {
            const isAdmin = await database.isAdmin(ctx.from.id);
            if (!isAdmin) return;

            const tariffs = await database.getTariffs();

            let msg = `💰 *Tariflar Sozlamalari*\n\n`;
            const buttons = [];

            if (tariffs.length === 0) {
                msg += "_Hozircha tariflar yo'q._\n";
            } else {
                tariffs.forEach(t => {
                    msg += `• *${t.name}*: ${t.price.toLocaleString()} so'm / ${t.duration_days} kun (${t.limit_per_day} ta/kun, ${t.word_limit || 30} so'z)\n`;
                    buttons.push([Markup.button.callback(`❌ O'chirish: ${t.name}`, `delete_tariff_${t.id}`)]);
                });
            }

            msg += `\nYangisini qo'shish uchun tugmani bosing:`;
            buttons.push([Markup.button.callback('➕ Yangi tarif qo\'shish', 'admin_add_tariff')]);
            buttons.push([Markup.button.callback('🔙 Orqaga', 'admin_panel_main')]);

            if (ctx.callbackQuery) {
                await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(() => { });
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
            }
        } catch (error) {
            console.error('Error in handleTariffSettings:', error);
            await ctx.reply('Xatolik yuz berdi.');
        }
    }

    async handleAddTariffRequest(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        ctx.session.state = 'waiting_for_tariff_info';
        await ctx.reply('💰 Yangi tarif ma\'lumotlarini quyidagi formatda yuboring:\n\n`NOM NARX KUN LIMIT SOZ_LIMIT`\n\nMisol: `Premium 50000 30 50 500`\n\nBekor qilish uchun /cancel deb yozing.', { parse_mode: 'Markdown' });
        if (ctx.callbackQuery) await ctx.answerCbQuery();
    }

    async handleAddTariff(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        const text = ctx.message.text;
        if (text === '/cancel') {
            ctx.session.state = null;
            return ctx.reply('Bekor qilindi.', this.adminMenu);
        }

        // Split by space but handle multiple spaces
        const parts = text.trim().split(/\s+/);
        if (parts.length < 5) return ctx.reply("❌ Format noto'g'ri. Iltimos, quyidagicha yuboring:\n\n`NOM NARX KUN LIMIT SOZ_LIMIT`.\n\nMisol: `Standard 50000 30 50 200`", { parse_mode: 'Markdown' });

        const name = parts[0];
        const price = parseInt(parts[1]);
        const duration = parseInt(parts[2]);
        const limit = parseInt(parts[3]);
        const wordLimit = parseInt(parts[4]);

        if (isNaN(price) || isNaN(duration) || isNaN(limit) || isNaN(wordLimit)) {
            return ctx.reply("❌ Narx, kun, limit va so'z limiti son bo'lishi kerak. Misol: `Standard 50000 30 50 200`", { parse_mode: 'Markdown' });
        }

        await database.addTariff(name, price, duration, limit, wordLimit);
        ctx.session.state = null;
        await ctx.reply(`✅ Yangi tarif qo'shildi: *${name}* (${wordLimit} so'z limit)`, { parse_mode: 'Markdown', ...this.adminMenu });
    }

    async handleApiMonitoring(ctx) {
        try {
            const isAdmin = await database.isAdmin(ctx.from.id);
            if (!isAdmin) return;

            const totalUsage = await database.getTotalApiUsage();
            const modelStats = await database.getApiStats();

            let msg = `📊 *Ravon AI Monitoring*\n\n`;

            msg += `📈 *Umumiy statistika:*\n`;
            msg += `• Jami so'rovlar: \`${totalUsage.total_requests}\`\n`;
            msg += `• Jami prompt tokenlar: \`${totalUsage.total_prompt_tokens?.toLocaleString() || 0}\`\n`;
            msg += `• Jami javob tokenlar: \`${totalUsage.total_candidates_tokens?.toLocaleString() || 0}\`\n`;
            msg += `• *Jami sarf qilingan tokenlar:* \`${totalUsage.total_tokens?.toLocaleString() || 0}\`\n\n`;

            if (modelStats.length > 0) {
                msg += `🤖 *Modellar bo'yicha:* \n`;
                modelStats.forEach(stat => {
                    msg += `\n*${stat.model_name}*:\n`;
                    msg += `  └ So'rovlar: \`${stat.total_requests}\`\n`;
                    msg += `  └ Tokenlar: \`${stat.total_tokens.toLocaleString()}\`\n`;
                });
            } else {
                msg += `_Hozircha ma'lumotlar mavjud emas._`;
            }

            const buttons = [
                [Markup.button.callback('🔄 Yangilash', 'admin_api_monitoring')],
                [Markup.button.callback('🔙 Orqaga', 'admin_panel_main')]
            ];

            if (ctx.callbackQuery) {
                await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(() => { });
                await ctx.answerCbQuery();
            } else {
                await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
            }
        } catch (error) {
            console.error('Error in handleApiMonitoring:', error);
            await ctx.reply('Monitoring ma\'lumotlarini olishda xatolik yuz berdi.');
        }
    }

    async handleDeleteTariff(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        const id = ctx.match[1];
        await database.deleteTariff(id);
        await ctx.answerCbQuery("Tarif o'chirildi.");
        await this.handleTariffSettings(ctx);
    }

    async handlePaymentRequests(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        const payments = await database.getPendingPayments();

        if (payments.length === 0) {
            return ctx.reply("📩 Hozirda yangi to'lov so'rovlari yo'q.");
        }

        for (const p of payments) {
            let msg = `📩 <b>Yangi To'lov So'rovi (ID: ${p.id})</b>\n\n`;
            msg += `👤 Foydalanuvchi: ${escapeHTML(p.first_name)} (@${escapeHTML(p.username || 'yo\'q')})\n`;
            msg += `💎 Tarif: ${escapeHTML(p.tariff_name)} (${(p.tariff_price || 0).toLocaleString()} so'm)\n`;
            msg += `📝 Tafsilotlar: ${escapeHTML(p.payment_details)}\n`;
            msg += `📅 Sana: ${escapeHTML(p.created_at)}`;

            const buttons = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Tasdiqlash', `approve_payment_${p.id}`)],
                [Markup.button.callback('❌ Rad etish', `reject_payment_${p.id}`)]
            ]);

            await ctx.replyWithPhoto(p.photo_file_id, { caption: msg, parse_mode: 'HTML', ...buttons });
        }
    }

    async handleApprovePayment(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        const paymentId = ctx.match[1];
        const payment = await database.getPaymentById(paymentId);

        if (!payment) return ctx.answerCbQuery("To'lov topilmadi.");

        await database.updatePaymentStatus(paymentId, 'approved');

        // Use tariff word limit or a safer default (100) instead of 30
        const wordLimit = payment.word_limit || payment.tariff_word_limit || 100;
        await database.approvePremium(payment.user_id, payment.duration_days, payment.limit_per_day, wordLimit);

        await ctx.answerCbQuery("✅ To'lov tasdiqlandi!");
        await ctx.editMessageCaption(`✅ <b>To'lov tasdiqlandi (ID: ${paymentId})</b>`, { parse_mode: 'HTML' });

        // Notify user
        try {
            await ctx.telegram.sendMessage(payment.telegram_id,
                `🎉 <b>Tabriklaymiz!</b> Sizning to'lovingiz tasdiqlandi.\n\n` +
                `💎 Premium obuna faollashdi!\n` +
                `📅 Amal qilish muddati: ${payment.duration_days} kun\n` +
                `🚀 Kunlik limitingiz: ${payment.limit_per_day} taga oshirildi.\n` +
                `📝 Matn uzunligi limiti: ${payment.word_limit || 30} so'z.`, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Notify user error:', e);
        }
    }

    async handleRejectPayment(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        const paymentId = ctx.match[1];
        const payment = await database.getPaymentById(paymentId);

        if (!payment) return ctx.answerCbQuery("To'lov topilmadi.");

        await database.updatePaymentStatus(paymentId, 'rejected');

        await ctx.answerCbQuery("❌ To'lov rad etildi.");
        await ctx.editMessageCaption(`❌ <b>To'lov rad etildi (ID: ${paymentId})</b>`, { parse_mode: 'HTML' });

        // Notify user
        try {
            await ctx.telegram.sendMessage(payment.telegram_id,
                `❌ Kechirasiz, sizning to'lovingiz rad etildi.\n` +
                `Iltimos, ma'lumotlarni qaytadan tekshirib ko'ring yoki admin bilan bog'laning.`, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error('Notify user error:', e);
        }
    }

    async handleManualTariffRequest(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        ctx.session.state = 'waiting_for_manual_tariff_user_id';
        await ctx.reply('🆔 Tarif bermoqchi bo\'lgan foydalanuvchining Telegram ID sini yuboring:', Markup.keyboard([['❌ Bekor qilish']]).resize());
        if (ctx.callbackQuery) await ctx.answerCbQuery();
    }

    async handleManualTariffLookup(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        const userId = ctx.message.text.trim();
        if (userId === '❌ Bekor qilish') {
            ctx.session.state = null;
            return ctx.reply('Bekor qilindi.', this.adminMenu);
        }

        if (isNaN(userId)) {
            return ctx.reply('⚠️ ID faqat raqamlardan iborat bo\'lishi kerak. Iltimos, qaytadan yuboring:');
        }

        const user = await database.getUserByTelegramId(userId);
        if (!user) {
            return ctx.reply('❌ Bu ID ga ega foydalanuvchi topilmadi. Iltimos, ID ni tekshirib qaytadan yuboring:');
        }

        const tariffs = await database.getTariffs();
        if (tariffs.length === 0) {
            return ctx.reply('⚠️ Hozirda tizimda faol tariflar yo\'q.');
        }

        let msg = `👤 <b>Foydalanuvchi ma'lumotlari:</b>\n\n`;
        msg += `Ism: ${escapeHTML(user.first_name)}\n`;
        msg += `ID: <code>${user.telegram_id}</code>\n`;
        msg += `Tarif: ${user.is_premium ? '💎 Premium' : '🆓 Bepul'}\n`;
        if (user.is_premium && user.premium_until) {
            msg += `Muddat: ${new Date(user.premium_until).toLocaleDateString()} gacha\n`;
        }

        msg += `\nUshbu foydalanuvchiga qaysi tarifni bermoqchisiz?`;

        const buttons = tariffs.map(t => [Markup.button.callback(`🎁 Berish: ${t.name}`, `mat_${user.telegram_id}_${t.id}`)]);
        buttons.push([Markup.button.callback('❌ Bekor qilish', 'admin_panel_main')]);

        ctx.session.state = null;
        await ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
    }

    async handleManualTariffApply(ctx) {
        const isAdmin = await database.isAdmin(ctx.from.id);
        if (!isAdmin) return;

        const [_, targetTelegramId, tariffId] = ctx.match;
        const tariffs = await database.getTariffs();
        const tariff = tariffs.find(t => t.id == tariffId);

        if (!tariff) return ctx.answerCbQuery("Tarif topilmadi.");

        const user = await database.getUserByTelegramId(targetTelegramId);
        if (!user) return ctx.answerCbQuery("Foydalanuvchi topilmadi.");

        await database.approvePremium(user.id, tariff.duration_days, tariff.limit_per_day, tariff.word_limit || 30);

        await ctx.answerCbQuery("✅ Tarif muvaffaqiyatli berildi!");
        await ctx.editMessageText(`✅ <b>${escapeHTML(user.first_name)}</b> ga <b>${escapeHTML(tariff.name)}</b> tarifi qo'lda berildi!`, { parse_mode: 'HTML' });

        // Notify user
        try {
            await ctx.telegram.sendMessage(targetTelegramId,
                `🎉 <b>Tabriklaymiz!</b> Admin tomonidan sizga <b>${escapeHTML(tariff.name)}</b> tarifi sovg'a qilindi!\n\n` +
                `💎 Premium obuna faollashdi!\n` +
                `📅 Amal qilish muddati: ${tariff.duration_days} kun\n` +
                `🚀 Kunlik limitingiz: ${tariff.limit_per_day} taga oshirildi.\n` +
                `📝 Matn uzunligi limiti: ${tariff.word_limit || 30} so'z.`, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Notify user error (manual):', e);
        }
    }

    async handleReferral(ctx) {
        const userId = ctx.from.id;
        const botUsername = ctx.botInfo.username;
        const referralLink = `https://t.me/${botUsername}?start=${userId}`;

        const referralInfo = await database.getReferralInfo(userId);
        const count = referralInfo.referral_count;
        const bonusLimit = referralInfo.bonus_limit;

        const nextReward = 3 - (count % 3);

        let msg = `🔗 *Sizning referal havolangiz:*\n\n` +
            `\`${referralLink}\`\n\n` +
            `👥 Taklif qilingan do'stlar: *${count}* ta\n` +
            `🎁 To'plangan bonus limitlar: *${bonusLimit}* ta\n\n` +
            `⭐ *Bonus tizimi:*\n` +
            `Har 3 ta taklif qilingan do'stingiz uchun sizga *+3 ta bonus limit* beriladi!\n\n` +
            `💡 Bonus limitlar kunlik limitingiz tugaganda avtomatik ishlatiladi va ular hech qachon yo'qolmaydi.\n\n`;

        if (nextReward === 3 && count > 0) {
            msg += `✅ Tabriklaymiz! Oxirgi 3 ta taklif uchun bonus oldingiz.`;
        } else {
            msg += `⏳ Keyingi bonusgaacha yana *${nextReward}* ta do'stingizni taklif qilishingiz kerak.`;
        }

        const shareLink = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Ingliz tili talaffuzini Ravon AI yordamida bepul tahlil qiling! 🚀")}`;

        await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
            [Markup.button.url('📤 Do\'stlarga ulashish', shareLink)]
        ]));
    }

    async handleStats(ctx) {
        try {
            const telegramId = ctx.from.id;
            const user = await database.getUserByTelegramId(telegramId);

            if (!user) {
                return ctx.reply("Foydalanuvchi topilmadi. Iltimos, /start buyrug'ini bosing.");
            }

            const userId = user.id; // Database ID
            const isTeacher = await database.isTeacher(telegramId);

            // Show user statistics and leaderboard for everyone
            const stats = await database.getUserStats(telegramId);
            const leaderboard = await database.getLeaderboard(10, 1);

            let statsMessage = `📈 *Sizning umumiy statistikangiz*\n\n` +
                `📊 Jami tahlillar: ${stats.total_assessments || 0}\n` +
                `⭐ O'rtacha umumiy ball: ${Math.round(stats.avg_overall || 0)}/100\n` +
                `🎯 O'rtacha aniqlik: ${Math.round(stats.avg_accuracy || 0)}/100\n` +
                `🗣 O'rtacha ravonlik: ${Math.round(stats.avg_fluency || 0)}/100\n\n`;

            if (leaderboard.length > 0) {
                statsMessage += `🏆 *TOP 10 Foydalanuvchilar:*\n\n`;
                leaderboard.forEach((u, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
                    const name = u.name;
                    const score = Math.round(u.avgOverall);
                    const count = u.total;
                    statsMessage += `${medal} ${index + 1}. ${name} — *${score} ball* (${count} ta)\n`;
                });
            } else {
                statsMessage += `🏆 *Reyting:* Hali ma'lumotlar yo'q.`;
            }
            // Start building the final message
            let finalMessage = statsMessage;
            const tasks = await database.getStudentTasks(userId);
            let buttons = [];

            if (tasks && tasks.length > 0) {
                finalMessage += `\n📋 *Mening topshiriqlarim (${tasks.length} ta):*\n`;
                tasks.forEach((task, index) => {
                    const statusIcon = task.status === 'pending' ? '⏳' : '✅';
                    const scoreText = task.overall_score !== null ? ` - ${task.overall_score} ball` : '';

                    if (task.status === 'pending' || (index < 3 && task.status === 'submitted')) {
                        finalMessage += `${statusIcon} "${task.task_text.substring(0, 30)}${task.task_text.length > 30 ? '...' : ''}"${scoreText}\n`;

                        if (task.status === 'pending') {
                            buttons.push([Markup.button.callback(`🎯 Bajarish`, `start_task_${task.id}`)]);
                        }
                    }
                });
            }

            if (buttons.length > 0) {
                await ctx.replyWithMarkdown(finalMessage, Markup.inlineKeyboard(buttons));
            } else {
                await ctx.replyWithMarkdown(finalMessage);
            }
        } catch (error) {
            console.error('Stats command error:', error);
            await ctx.reply("Kechirasiz, ma'lumotlarni olishda xatolik yuz berdi.");
        }
    }

    async handleStartTask(ctx) {
        const taskId = ctx.match[1];
        console.log('handleStartTask called with taskId:', taskId);

        try {
            const user = await database.getUserByTelegramId(ctx.from.id);
            if (!user) {
                return ctx.answerCbQuery('❌ Foydalanuvchi topilmadi.', { show_alert: true });
            }

            const task = await database.getTaskById(taskId);
            console.log('Retrieved task:', task);

            if (!task) {
                console.log('Task not found for ID:', taskId);
                return ctx.answerCbQuery('❌ Topshiriq topilmadi.', { show_alert: true });
            }

            // Verify this task belongs to the current user
            if (task.student_id !== user.id) {
                console.log('Task belongs to different user. Task student_id:', task.student_id, 'Current user DB ID:', user.id);
                return ctx.answerCbQuery('❌ Bu topshiriq sizga tegishli emas.', { show_alert: true });
            }

            if (task.status !== 'pending') {
                console.log('Task not pending. Status:', task.status);
                return ctx.answerCbQuery('❌ Bu topshiriq allaqachon bajarilgan.', { show_alert: true });
            }

            // Set session state for task completion
            ctx.session = ctx.session || {};
            ctx.session.currentTaskId = taskId;
            ctx.session.state = 'completing_task';

            await ctx.answerCbQuery();

            const taskMessage = `🎯 *Topshiriqni bajarish*\n\n` +
                `📝 *Topshiriq:* "${task.task_text}"\n` +
                `👨‍🏫 O\'qituvchi: ${task.teacher_name}\n` +
                `📅 Berilgan: ${task.created_at.split(' ')[0]}\n\n` +
                `🎤 *Iltimos, quyidagi matnni o'qing va audio yuboring:*\n\n` +
                `"${task.task_text}"\n\n` +
                `💡 *Ko\'rsatma:* Matnni baland va aniq o'qing. Audio tugmasini bosib, yozib oling.`;

            await ctx.editMessageText(taskMessage, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Orqaga', 'back_to_stats')],
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_task')]
                ])
            });

        } catch (error) {
            console.error('Start task error:', error);
            await ctx.answerCbQuery('❌ Xatolik yuz berdi.', { show_alert: true });
        }
    }

    async handleViewTask(ctx) {
        const taskId = ctx.match[1];

        try {
            const user = await database.getUserByTelegramId(ctx.from.id);
            if (!user) {
                return ctx.answerCbQuery('❌ Foydalanuvchi topilmadi.', { show_alert: true });
            }

            const task = await database.getTaskById(taskId);

            if (!task) {
                return ctx.answerCbQuery('❌ Topshiriq topilmadi.', { show_alert: true });
            }

            // Verify this task belongs to the current user
            if (task.student_id !== user.id) {
                return ctx.answerCbQuery('❌ Bu topshiriq sizga tegishli emas.', { show_alert: true });
            }

            await ctx.answerCbQuery();

            let statusText = '';
            let statusIcon = '';

            if (task.status === 'submitted') {
                statusText = 'Topshirilgan';
                statusIcon = '✅';
            } else if (task.status === 'graded') {
                statusText = 'Baholangan';
                statusIcon = '📊';
            }

            let taskMessage = `📋 *Topshiriq ma\'lumotlari*\n\n` +
                `${statusIcon} *Holati:* ${statusText}\n` +
                (task.overall_score !== null ? `📊 *Natija:* ${task.overall_score} ball\n` : '') +
                `📝 *Topshiriq:* "${task.task_text}"\n` +
                `👨‍🏫 O\'qituvchi: ${task.teacher_name}\n` +
                `📅 Berilgan: ${task.created_at.split(' ')[0]}\n`;

            if (task.submitted_at) {
                taskMessage += `✅ Topshirilgan: ${task.submitted_at.split(' ')[0]}\n`;
            }

            if (task.due_date) {
                taskMessage += `⏰ Muddati: ${task.due_date}\n`;
            }

            taskMessage += `\n🔙 Orqaga qaytish uchun "📊 Mening natijalarim" tugmasini bosing.`;

            await ctx.editMessageText(taskMessage, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔙 Orqaga', 'back_to_stats')]
                ])
            });

        } catch (error) {
            console.error('View task error:', error);
            await ctx.answerCbQuery('❌ Xatolik yuz berdi.', { show_alert: true });
        }
    }

    async handleCancelTask(ctx) {
        try {
            // Clear task-related session state
            if (ctx.session) {
                delete ctx.session.currentTaskId;
                delete ctx.session.state;
            }

            await ctx.answerCbQuery();
            await this.handleStats(ctx);

        } catch (error) {
            console.error('Cancel task error:', error);
            await ctx.answerCbQuery('❌ Xatolik yuz berdi.', { show_alert: true });
        }
    }

    async handleDownloadPdfReport(ctx) {
        try {
            const data = ctx.session?.lastAssessmentData;
            const type = ctx.session?.lastAssessmentType || 'general';

            if (!data) {
                return ctx.answerCbQuery('⚠️ Ma\'lumot topilmadi. Iltimos, qaytadan tahlil qiling.', { show_alert: true });
            }

            await ctx.answerCbQuery('PDF tayyorlanmoqda... ⏳');
            const pdfPath = await pdfService.generateReport(ctx.from, data, type);

            await ctx.replyWithDocument({ source: pdfPath, filename: `Talaffuz_Tahlili_${ctx.from.id}.pdf` });

            // Cleanup
            await pdfService.cleanup(pdfPath);
        } catch (error) {
            console.error('PDF generation error:', error);
            await ctx.reply('PDF yaratishda xatolik yuz berdi.');
        }
    }

    async handlePlayCorrect(ctx) {
        try {
            const data = ctx.session?.lastAssessmentData;
            const type = ctx.session?.lastAssessmentType;

            if (!data || !data.transcription) {
                return ctx.answerCbQuery("⚠️ Ma'lumot topilmadi.", { show_alert: true });
            }

            await ctx.answerCbQuery("Audio tayyorlanmoqda... ⏳");

            const textToRead = data.targetText || data.transcription;
            const audioPath = await ttsService.generateAudio(textToRead, 'en');

            await ctx.reply(`🔊 *To'g'ri talaffuz:*\n\n_"${textToRead}"_`, { parse_mode: 'Markdown' });
            await ctx.replyWithAudio({ source: audioPath });

            await ttsService.cleanup(audioPath);
        } catch (error) {
            console.error('Play Correct Error:', error);
            await ctx.reply("Audioni yaratishda xatolik yuz berdi.");
        }
    }
}

module.exports = new CommandHandler();
