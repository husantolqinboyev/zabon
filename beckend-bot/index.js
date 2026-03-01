const { Telegraf, session, Markup } = require('telegraf');
const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const config = require('./config');
const { safeAnswerCbQuery } = require('./utils/telegramUtils');
const { escapeHTML } = require('./utils/textUtils');
const commandHandler = require('./handlers/commandHandler');
const audioHandler = require('./handlers/audioHandler');
const database = require('./database');
const cors = require('cors');

// Initialize bot
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// Middleware
bot.use(session());

// Pre-flight validation for environment
const validateEnvironment = async () => {
    const token = config.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error('CRITICAL: TELEGRAM_BOT_TOKEN topilmadi. .env faylida TELEGRAM_BOT_TOKEN ni sozlang.');
        process.exit(1);
    }
    const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
    if (!tokenPattern.test(token)) {
        console.error('CRITICAL: TELEGRAM_BOT_TOKEN formati noto‘g‘ri. @BotFather dan olingan to‘g‘ri tokenni kiriting.');
        process.exit(1);
    }
    try {
        const me = await bot.telegram.getMe();
        console.log(`✅ Telegram bot tekshirildi: @${me.username}`);
    } catch (e) {
        if (e.response?.error_code === 401) {
            console.error('CRITICAL: 401 Unauthorized — Telegram token noto‘g‘ri yoki bekor qilingan. @BotFather dan yangi token oling va .env faylini yangilang.');
            process.exit(1);
        }
        console.error('CRITICAL: Telegram bilan bog‘lanishda xato:', e.message);
        process.exit(1);
    }
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        console.error('CRITICAL: SUPABASE_URL yoki SUPABASE_ANON_KEY topilmadi. .env faylini tekshiring.');
        process.exit(1);
    }
};

// Ensure session exists
bot.use(async (ctx, next) => {
    if (!ctx.session) ctx.session = {};

    // Ensure user exists in DB and attach to context
    if (ctx.from && !ctx.from.is_bot) {
        let user = await database.getUserByTelegramId(ctx.from.id);
        if (!user) {
            await database.saveUser(ctx.from);
            user = await database.getUserByTelegramId(ctx.from.id);
        }
        ctx.state.user = user;
    }

    return next();
});

// Channel Membership Middleware
bot.use(async (ctx, next) => {
    // Skip check for certain update types or commands
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'check_subscription') {
        return next();
    }

    const userId = ctx.from?.id;
    if (!userId) return next();

    // Handle Broadcast state first
    if (ctx.session?.state === 'broadcast_composing' && (ctx.message || ctx.editedMessage)) {
        return commandHandler.handleBroadcastContent(ctx);
    }

    // Skip check for Admin
    const isAdmin = await database.isAdmin(userId);
    if (isAdmin) return next();

    // Check Premium Status (handles expiry)
    await database.checkPremiumStatus(userId);

    try {
        const member = await ctx.telegram.getChatMember(config.REQUIRED_CHANNEL_ID, userId);
        const isMember = ['member', 'administrator', 'creator'].includes(member.status);

        if (!isMember) {
            return ctx.reply(
                "⚠️ Botdan foydalanish uchun rasmiy kanalimizga a'zo bo'lishingiz kerak!",
                Markup.inlineKeyboard([
                    [Markup.button.url("Kanalga a'zo bo'lish", config.CHANNEL_URL)],
                    [Markup.button.callback("✅ A'zo bo'ldim / Tekshirish", "check_subscription")]
                ])
            );
        }
    } catch (error) {
        console.error('Membership check error:', error);
        // If error (e.g. bot not admin in channel), allow access but log it
        if (error.description && error.description.includes('chat not found')) {
            console.error('CRITICAL: Bot is not admin in the channel or Channel ID is wrong!');
        }
    }

    return next();
});

// Handle Subscription Check Callback
bot.action('check_subscription', async (ctx) => {
    const userId = ctx.from.id;
    try {
        const member = await ctx.telegram.getChatMember(config.REQUIRED_CHANNEL_ID, userId);
        const isMember = ['member', 'administrator', 'creator'].includes(member.status);

        if (isMember) {
            await safeAnswerCbQuery(ctx, "✅ Rahmat! Endi botdan foydalanishingiz mumkin.");
            await ctx.deleteMessage().catch(() => { });
            return commandHandler.handleStart(ctx);
        } else {
            await safeAnswerCbQuery(ctx, "❌ Siz hali kanalga a'zo emassiz!", { show_alert: true });
        }
    } catch (error) {
        console.error('Check action error:', error);
        await safeAnswerCbQuery(ctx, "Xatolik yuz berdi. Iltimos, kanalga a'zo ekanligingizni tekshiring.");
    }
});

// Start command
bot.start((ctx) => commandHandler.handleStart(ctx));

// Admin commands
bot.command('admin', (ctx) => commandHandler.handleAdmin(ctx));
bot.command('teacher', (ctx) => commandHandler.handleTeacher(ctx));

// Main Menu Handlers
bot.hears('🎙 Talaffuzni tekshirish', (ctx) => commandHandler.handlePronunciationMenu(ctx));
bot.hears('🔊 Matnni ovozga aylantirish', (ctx) => commandHandler.handleTextToAudio(ctx));
bot.hears('👤 Profil', (ctx) => commandHandler.handleProfile(ctx));
bot.hears('💳 Tariflar | Ko\'proq foyda olish', (ctx) => commandHandler.handleTariffPlan(ctx));
bot.hears('❓ Bot qanday ishlaydi?', (ctx) => commandHandler.handleHowItWorks(ctx));
bot.hears('📱 Mini App', (ctx) => commandHandler.handleMiniApp(ctx));
bot.hears('🏠 Asosiy menyu', (ctx) => commandHandler.handleMainMenu(ctx));
bot.hears('🔙 Asosiy menyu', (ctx) => commandHandler.handleMainMenu(ctx));

// Admin & Teacher Panel Handlers
bot.hears('👥 Foydalanuvchilar', (ctx) => commandHandler.handleUsers(ctx));
bot.hears(['➕ Test so\'zi qo\'shish', '➕ Matn qo\'shish'], (ctx) => commandHandler.handleTestWord(ctx));
bot.hears('👥 O\'quvchilarim', (ctx) => commandHandler.handleMyStudents(ctx));
bot.hears('➕ Topshiriq berish', (ctx) => commandHandler.handleMyStudents(ctx));
bot.hears('📋 Topshiriqlarim', (ctx) => commandHandler.handleMyTasks(ctx));
bot.hears('📊 Natijalar', (ctx) => commandHandler.handleUserResults(ctx));
bot.hears('🤖 AI matn yaratish', (ctx) => commandHandler.handleAiTextGeneration(ctx));
bot.hears('🤖 AI so\'z yaratish', (ctx) => commandHandler.handleAiWordGeneration(ctx));
bot.hears('📚 Matnlar ro\'yxati', (ctx) => commandHandler.handleManageTexts(ctx));
bot.hears('📊 Umumiy statistika', (ctx) => commandHandler.handleAdminStats(ctx));
bot.hears('📋 Oxirgi natijalar', (ctx) => commandHandler.handleUserResults(ctx));
bot.hears('👨‍🏫 O\'qituvchilar', (ctx) => commandHandler.handleTeachers(ctx));
bot.hears('💳 Karta sozlamalari', (ctx) => commandHandler.handleCardSettings(ctx));
bot.hears('💰 Tariflar', (ctx) => commandHandler.handleTariffSettings(ctx));
bot.hears('📩 To\'lov so\'rovlari', (ctx) => commandHandler.handlePaymentRequests(ctx));
bot.hears('📢 E\'lon berish', (ctx) => commandHandler.handleBroadcastRequest(ctx));
bot.hears('📊 API Monitoring', (ctx) => commandHandler.handleApiMonitoring(ctx));
bot.hears('💳 Qolda tarif berish', (ctx) => commandHandler.handleManualTariffRequest(ctx));

// Admin commands with arguments
bot.command('setcard', (ctx) => commandHandler.handleSetCard(ctx));
bot.command('addtariff', (ctx) => commandHandler.handleAddTariff(ctx));

// Action handlers
bot.action('admin_set_card', (ctx) => commandHandler.handleSetCardRequest(ctx));
bot.action('admin_add_tariff', (ctx) => commandHandler.handleAddTariffRequest(ctx));
bot.action('admin_panel_main', (ctx) => commandHandler.handleAdmin(ctx));
bot.action('admin_api_monitoring', (ctx) => commandHandler.handleApiMonitoring(ctx));
bot.action(/select_tariff_(.+)/, (ctx) => commandHandler.handleSelectTariff(ctx));
bot.action(/delete_tariff_(.+)/, (ctx) => commandHandler.handleDeleteTariff(ctx));
bot.action(/approve_payment_(.+)/, (ctx) => commandHandler.handleApprovePayment(ctx));
bot.action(/reject_payment_(.+)/, (ctx) => commandHandler.handleRejectPayment(ctx));
bot.action('broadcast_add_button', (ctx) => commandHandler.handleBroadcastAddButtonRequest(ctx));
bot.action('broadcast_add_bot_button', (ctx) => commandHandler.handleBroadcastAddBotButtonRequest(ctx));
bot.action('broadcast_preview', (ctx) => commandHandler.handleBroadcastPreview(ctx));
bot.action('broadcast_send', (ctx) => commandHandler.handleBroadcastSend(ctx));
bot.action('broadcast_cancel', (ctx) => commandHandler.handleBroadcastCancel(ctx));
bot.action(/manage_user_(.+)/, (ctx) => commandHandler.handleManageUser(ctx));
bot.action(/toggle_teacher_(\d+)_(0|1)/, (ctx) => commandHandler.handleToggleTeacher(ctx));
bot.action(/add_limit_(\d+)_(\d+)/, (ctx) => commandHandler.handleAddLimit(ctx));
bot.action('admin_users_list', (ctx) => commandHandler.handleUsers(ctx));
bot.action('show_referral_info', (ctx) => commandHandler.handleReferral(ctx));
bot.action(/mat_(\d+)_(.+)/, (ctx) => commandHandler.handleManualTariffApply(ctx));

// AI Generation actions
bot.action(/ai_generate_(easy|medium|hard)_(word|sentence|text)/, (ctx) => commandHandler.handleAiGenerate(ctx));
bot.action('back_to_teacher_menu', (ctx) => commandHandler.handleTeacher(ctx));

// Student management actions
bot.action(/assign_task_(\d+)/, (ctx) => commandHandler.handleAssignTask(ctx));
bot.action(/remove_student_(\d+)/, (ctx) => commandHandler.handleRemoveStudent(ctx));
bot.action('assign_student_menu', (ctx) => commandHandler.handleAssignStudentMenu(ctx));
bot.action('assign_user_menu', (ctx) => commandHandler.handleAssignUserMenu(ctx));
bot.action('show_user_selection_for_assignment', (ctx) => commandHandler.handleUserSelectionForAssignment(ctx));
bot.action(/select_user_for_student_(\d+)/, (ctx) => commandHandler.handleUserSelectionForAssignmentCallback(ctx));
bot.action(/confirm_remove_(\d+)/, (ctx) => commandHandler.handleConfirmRemoveStudent(ctx));
bot.action('cancel_remove', (ctx) => commandHandler.handleCancelRemoveStudent(ctx));

// Task interaction actions
bot.action(/start_task_(\d+)/, (ctx) => commandHandler.handleStartTask(ctx));
bot.action(/view_task_(\d+)/, (ctx) => commandHandler.handleViewTask(ctx));
bot.action('back_to_stats', (ctx) => commandHandler.handleStats(ctx));
bot.action('cancel_task', (ctx) => commandHandler.handleCancelTask(ctx));
bot.action('view_my_tasks', (ctx) => commandHandler.handleStats(ctx));

// Help command
bot.help((ctx) => commandHandler.handleHelp(ctx));

// Compare choice callback
bot.action(/compare_choice_/, (ctx) => commandHandler.handleCompareChoice(ctx));
bot.action('download_pdf_report', (ctx) => commandHandler.handleDownloadPdfReport(ctx));
bot.action(/play_correct_/, (ctx) => commandHandler.handlePlayCorrect(ctx));
bot.action('listen_test_text', (ctx) => commandHandler.handleListenTestText(ctx));
bot.action('confirm_test_reading', (ctx) => commandHandler.handleConfirmTestReading(ctx));
bot.action(/random_(word|text)/, (ctx) => commandHandler.handleRandomStart(ctx));
bot.action(/start_test_(.+)/, (ctx) => commandHandler.handleStartTestById(ctx));
bot.action('test_pronunciation_list', (ctx) => commandHandler.handleTestPronunciationList(ctx));
bot.action(/delete_text_(.+)/, (ctx) => commandHandler.handleDeleteText(ctx));
bot.action('pronunciation_write_own', (ctx) => commandHandler.handlePronunciationWriteOwn(ctx));
bot.action('pronunciation_random', (ctx) => commandHandler.handleRandomMenu(ctx));
bot.action('top_users', (ctx) => commandHandler.handleTopUsers(ctx));
bot.action(/texts_page_(.+)/, (ctx) => commandHandler.handleTextsPage(ctx));
bot.action('texts_type_word', (ctx) => commandHandler.handleTextsType(ctx));
bot.action('texts_type_text', (ctx) => commandHandler.handleTextsType(ctx));
bot.action('cancel_texts_mgmt', (ctx) => commandHandler.handleCancelTexts(ctx));
bot.action(/users_page_(.+)/, (ctx) => commandHandler.handleUsersPage(ctx));
bot.action('users_type_free', (ctx) => commandHandler.handleUsersType(ctx));
bot.action('users_type_premium', (ctx) => commandHandler.handleUsersType(ctx));
bot.action('cancel_users_mgmt', (ctx) => commandHandler.handleCancelUsers(ctx));

// Audio and voice messages
bot.on(['audio', 'voice'], (ctx) => audioHandler.handleAudio(ctx));

// Text message handling for state machine and other messages
bot.on('text', async (ctx, next) => {
    if (ctx.session?.state === 'broadcast_waiting_button') {
        return commandHandler.handleBroadcastAddButtonSave(ctx);
    }
    if (ctx.session?.state === 'broadcast_waiting_bot_button') {
        return commandHandler.handleBroadcastAddBotButtonSave(ctx);
    }
    if (ctx.session?.state === 'waiting_for_text_for_pronunciation') {
        return commandHandler.processTextForPronunciation(ctx);
    }

    if (ctx.session?.state === 'waiting_for_card_info') {
        return commandHandler.handleSetCard(ctx);
    }

    if (ctx.session?.state === 'waiting_for_tariff_info') {
        return commandHandler.handleAddTariff(ctx);
    }

    if (ctx.session?.state === 'waiting_for_task_text') {
        return commandHandler.handleTaskTextProcessing(ctx);
    }

    if (ctx.session?.state === 'waiting_for_student_assignment') {
        return commandHandler.handleStudentAssignmentProcessing(ctx);
    }

    if (ctx.session?.state === 'waiting_for_manual_tariff_user_id') {
        return commandHandler.handleManualTariffLookup(ctx);
    }

    // Check if it's a command or menu button, if so, reset state and let next middleware handle it
    const menuButtons = [
        '🎙 Talaffuzni tekshirish', '🔊 Matnni ovozga aylantirish',
        '👤 Profil', '💳 Tariflar | Ko\'proq foyda olish', '❓ Bot qanday ishlaydi?',
        '🏠 Asosiy menyu', '🔙 Asosiy menyu'
    ];

    if (ctx.message.text.startsWith('/') || menuButtons.includes(ctx.message.text)) {
        ctx.session.state = null;
        return next();
    }

    return audioHandler.handleText(ctx);
});

// Handle Mini App data
bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data.json());
        if (data.source === 'mini_app') {
            const action = data.action;

            if (action === 'check_pronunciation') return commandHandler.handlePronunciationMenu(ctx);
            if (action === 'text_to_audio') return commandHandler.handleTextToAudio(ctx);
            if (action === 'profile') return commandHandler.handleProfile(ctx);
            if (action === 'tariffs') return commandHandler.handleTariffPlan(ctx);
            if (action === 'how_it_works') return commandHandler.handleHowItWorks(ctx);

            // Handle tariff selection
            if (action.startsWith('select_tariff_')) {
                const tariffId = action.replace('select_tariff_', '');
                ctx.match = [null, tariffId];
                return commandHandler.handleSelectTariff(ctx);
            }
        }
    } catch (error) {
        console.error('Web App Data Error:', error);
    }
});

// Photo handling for payment receipts
bot.on(['photo', 'video', 'document'], async (ctx) => {
    if (ctx.session?.state === 'broadcast_composing') {
        return commandHandler.handleBroadcastContent(ctx);
    }

    if (ctx.session?.state === 'waiting_for_payment_details' && ctx.message.photo) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const caption = ctx.message.caption || 'Izohsiz yuborildi';

        const tariff = ctx.session.selectedTariff;
        if (!tariff) {
            ctx.session.state = null;
            return ctx.reply("⚠️ Seans muddati tugagan ko'rinadi. Iltimos, Premium menyusidan tarifni qaytadan tanlang.");
        }

        const user = await database.getUserByTelegramId(ctx.from.id);

        await database.createPaymentRequest(user.id, tariff.id, photo.file_id, caption);

        ctx.session.state = null;
        ctx.session.selectedTariff = null;

        await ctx.reply("✅ To'lov cheki qabul qilindi! Adminlar tez orada ko'rib chiqib, Premium obunangizni tasdiqlashadi.");

        // Notify admin
        const admins = await database.getAdmins();
        for (const admin of admins) {
            try {
                await ctx.telegram.sendPhoto(admin.telegram_id, photo.file_id, {
                    caption: `💰 <b>Yangi to'lov so'rovi!</b>\n\n` +
                        `👤 Foydalanuvchi: ${escapeHTML(ctx.from.first_name)} (@${escapeHTML(ctx.from.username || 'username yo\'q')})\n` +
                        `💎 Tarif: ${escapeHTML(tariff.name)}\n` +
                        `💵 Narxi: ${tariff.price.toLocaleString()} so'm\n` +
                        `📝 Izoh: ${escapeHTML(caption)}\n\n` +
                        `Tasdiqlash yoki rad etish uchun 'To'lov so'rovlari' bo'limiga kiring.`,
                    parse_mode: 'HTML'
                });
            } catch (err) {
                console.error(`Admin ${admin.telegram_id}ga xabar yuborishda xato:`, err);
            }
        }
        return;
    }

    await ctx.reply("Iltimos, avval menyudan kerakli bo'limni tanlang.");
});

// Error handling with better user blocking detection
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);

    // Check if user blocked the bot
    if (err.response?.error_code === 403 &&
        err.response?.description?.includes('bot was blocked by the user')) {
        console.log(`User ${ctx.from?.id} blocked the bot`);
        return; // Don't try to reply to blocked users
    }

    // Check if it's a callback query timeout
    if (err.response?.error_code === 400 &&
        (err.response?.description?.includes('timeout') ||
            err.response?.description?.includes('invalid'))) {
        console.log('Callback query timeout - ignoring');
        return; // Don't reply to timeout errors
    }

    // For other errors, try to reply safely
    try {
        ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    } catch (replyError) {
        console.error('Failed to send error message:', replyError.message);
    }
});

// Update bot description with simple description
const updateBotDescription = async () => {
    try {
        // Set simple description without user count for now
        const description = "Ingliz tili talaffuzini baholash boti";

        // Update bot description
        await bot.telegram.setMyDescription(description);
        console.log(`Bot description updated: ${description}`);

    } catch (error) {
        console.error('Error updating bot description:', error);
    }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process, just log the error
});

// Start bot with retry logic
const startBot = async (retries = 5) => {
    // Validate env and token before anything else
    await validateEnvironment();

    // Initialize database tables/seed data
    try {
        await database.initializeTables();
    } catch (dbErr) {
        console.error('Database initialization error:', dbErr);
    }

    // Start health check and Mini App server
    const PORT = process.env.PORT || 3000;
    const app = express();

    // Enable CORS with more permissive settings for debugging
    app.use(cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            const allowedOrigins = [config.APP_URL];
            const isAllowed = allowedOrigins.some(ao => ao && (ao.includes(origin) || origin.includes(ao.replace('https://', ''))));
            if (isAllowed) return callback(null, true);
            console.log('CORS blocked origin:', origin);
            return callback(null, true);
        },
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'x-telegram-init-data']
    }));

    app.use(express.json());

    const distPath = path.join(__dirname, 'web', 'dist');
    const distExists = fs.existsSync(distPath);
    if (distExists) {
        app.use(express.static(distPath));
    } else {
        console.warn('Mini App build topilmadi. web/dist mavjud emas.');
    }
    const miniappPath = path.resolve(__dirname, '..', 'miniapp');
    const miniappExists = fs.existsSync(miniappPath);
    if (miniappExists) {
        app.use(express.static(miniappPath));
    } else {
        console.warn('Mini App papkasi topilmadi.');
    }

    // API endpoints for Mini App
    const webApi = require('./web-api');
    app.use('/api', webApi);

    // Health check and root route

    app.get('/ping', (req, res) => res.send('pong'));
    app.get('/', (req, res) => {
        const indexDist = path.join(distPath, 'index.html');
        const indexMini = path.join(miniappPath, 'index.html');
        if (fs.existsSync(indexDist)) {
            return res.sendFile(indexDist);
        }
        if (fs.existsSync(indexMini)) {
            return res.sendFile(indexMini);
        }
        return res.send('Ravon AI API Server is running...');
    });

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`📡 Health check and Mini App server listening on port ${PORT}`);

        const pingInterval = setInterval(() => {
            const localUrl = `http://127.0.0.1:${PORT}/ping`;
            http.get(localUrl, (res) => {
                console.log(`Ping ${localUrl}: ${res.statusCode}`);
            }).on('error', (err) => {
                console.error(`Ping ${localUrl} error: ${err.message}`);
            });
            const base = config.PING_URL || config.APP_URL || '';
            let target = base;
            if (base && !base.startsWith('http')) target = `https://${base}`;
            if (target) {
                const client = target.startsWith('https') ? https : http;
                client.get(`${target}/ping`, (res) => {
                    console.log(`Ping ${target}/ping: ${res.statusCode}`);
                }).on('error', (err) => {
                    console.error(`Ping ${target}/ping error: ${err.message}`);
                });
            }
        }, 10 * 60 * 1000);

        // Store interval to clear it later
        process.on('shutdown', () => clearInterval(pingInterval));
    });

    // Store server to close it later
    process.on('shutdown', () => {
        server.close(() => console.log('HTTP server closed'));
    });

    // Force polling mode to avoid webhook conflicts
    process.env.TELEGRAM_API_URL = undefined;

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`🚀 Starting Preimum English AI bot... (Attempt ${i + 1}/${retries})`);

            // Clear any existing webhook
            await bot.telegram.deleteWebhook({ drop_pending_updates: true });
            console.log('✅ Webhook cleared');

            // Start with optimized polling
            await bot.launch({
                polling: {
                    interval: 300,
                    autoStart: true,
                    allowedUpdates: ['message', 'callback_query', 'edited_message', 'voice', 'audio']
                }
            });

            console.log('✅ Bot is running with polling!');

            // Set Mini App menu button
            await bot.telegram.setChatMenuButton({
                menuButton: {
                    type: 'web_app',
                    text: '🚀 Ravon Web',
                    web_app: { url: config.APP_URL }
                }
            });
            console.log('✅ Mini App menu button set');
            return;
        } catch (err) {
            console.error(`❌ Launch error (Attempt ${i + 1}):`, err.message);
            if (err.message.includes('409')) {
                console.log('⏳ Waiting for previous instance to stop...');
                await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            }
            if (i < retries - 1) {
                const waitTime = 5000 * (i + 1);
                console.log(`🔄 Retrying in ${waitTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                console.error('💥 Max retries reached. Could not start bot.');
                process.exit(1);
            }
        }
    }
};

startBot();

// Update bot description periodically
updateBotDescription(); // Update immediately on start
const descriptionInterval = setInterval(updateBotDescription, 60 * 60 * 1000); // Update every 1 hour
process.on('shutdown', () => clearInterval(descriptionInterval));

// Graceful shutdown function
const gracefulShutdown = async (signal) => {
    console.log(`\n👋 ${signal} received. Shutting down gracefully...`);

    // Stop the bot
    try {
        await bot.stop(signal);
        console.log('✅ Bot stopped');
    } catch (err) {
        console.error('Error stopping bot:', err.message);
    }

    // Emit shutdown event for other components (server, intervals)
    process.emit('shutdown');

    // Wait a bit for everything to close then exit
    setTimeout(() => {
        console.log('Bye!');
        process.exit(0);
    }, 1000);
};

// Enable graceful stop
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
