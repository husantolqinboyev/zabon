require('dotenv').config();

module.exports = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    // Bot configuration
    MAX_AUDIO_DURATION: 30, // seconds
    SUPPORTED_AUDIO_TYPES: ['audio/ogg', 'audio/mpeg', 'audio/wav'],

    // OpenRouter Settings
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'google/gemini-3-flash-preview',

    // Legacy Gemini aliases (for backward compatibility)
    GEMINI_API_KEY: process.env.OPENROUTER_API_KEY,
    GEMINI_MODEL: process.env.OPENROUTER_MODEL || 'google/gemini-flash-1.5',

    // Admin Settings
    ADMIN_IDS: process.env.ADMIN_ID ? process.env.ADMIN_ID.split(',').map(id => id.trim()) : [],

    // Channel Subscription Check
    REQUIRED_CHANNEL_ID: '-1003014655042',
    CHANNEL_URL: 'https://t.me/englishwithSanatbek',

    // Admin Contact
    ADMIN_USERNAME: '@khamidovsanat',

    // Supabase Configuration
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    APP_URL: process.env.APP_URL || '',
    PING_URL: process.env.PING_URL || process.env.APP_URL || ''
};
