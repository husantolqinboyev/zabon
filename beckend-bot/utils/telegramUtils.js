// Telegram callback query utilities

/**
 * Safely answer callback query with error handling
 * @param {Object} ctx - Telegraf context
 * @param {string} text - Response text
 * @param {Object} options - Additional options
 */
async function safeAnswerCbQuery(ctx, text = null, options = {}) {
    try {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery(text, options);
        }
    } catch (error) {
        // Log error but don't crash the bot
        console.warn('Callback query answer failed:', error.message);
        
        // Don't try to answer again if it's a timeout/bad request
        if (error.response?.error_code === 400 || 
            error.response?.description?.includes('timeout') ||
            error.response?.description?.includes('invalid')) {
            return;
        }
        
        // For other errors, try once more with minimal response
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery();
            }
        } catch (retryError) {
            // Silent fail - don't log again to avoid spam
        }
    }
}

/**
 * Safely edit message with error handling
 * @param {Object} ctx - Telegraf context
 * @param {string} text - Message text
 * @param {Object} extra - Additional options
 */
async function safeEditMessage(ctx, text, extra = {}) {
    try {
        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, extra);
        } else {
            await ctx.reply(text, extra);
        }
    } catch (error) {
        console.warn('Message edit failed:', error.message);
        
        // Fallback to reply if edit fails
        try {
            await ctx.reply(text, extra);
        } catch (replyError) {
            console.error('Both edit and reply failed:', replyError.message);
        }
    }
}

module.exports = {
    safeAnswerCbQuery,
    safeEditMessage
};
