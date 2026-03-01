const { Telegraf } = require('telegraf');
const config = require('../config');

async function resetWebhook() {
    try {
        console.log('Resetting webhook...');
        
        const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
        
        // Delete webhook
        await bot.telegram.deleteWebhook();
        console.log('✅ Webhook deleted');
        
        // Get bot info
        const botInfo = await bot.telegram.getMe();
        console.log(`🤖 Bot: @${botInfo.username}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error resetting webhook:', error.message);
        process.exit(1);
    }
}

resetWebhook();
