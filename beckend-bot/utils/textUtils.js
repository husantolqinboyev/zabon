/**
 * Count words in text
 * @param {string} text - Input text
 * @returns {number} - Word count
 */
function countWords(text) {
    if (!text || typeof text !== 'string') return 0;

    // Remove extra whitespace and split by spaces
    const words = text.trim().split(/\s+/);

    // Filter out empty strings
    return words.filter(word => word.length > 0).length;
}

/**
 * Check if text exceeds word limit
 * @param {string} text - Input text
 * @param {number} limit - Word limit
 * @returns {boolean} - True if exceeds limit
 */
function exceedsWordLimit(text, limit) {
    return countWords(text) > limit;
}

/**
 * Get word limit info for user
 * @param {Object} user - User object from database
 * @returns {Object} - Word limit info
 */
function getUserWordLimit(user) {
    const defaultLimits = {
        free: 30,
        basic: 70,
        standard: 150,
        premium: 300
    };

    // Determine base limit based on plan
    let baseLimit = defaultLimits.free;
    let planType = 'free';

    if (user.is_premium) {
        baseLimit = defaultLimits.premium;
        planType = 'premium';
    } else {
        const totalDailyLimit = (user.daily_limit || 0) + (user.bonus_limit || 0);
        if (totalDailyLimit > 3) {
            baseLimit = defaultLimits.basic;
            planType = 'basic';
        }
    }

    // If user has a custom word_limit that is different from the default free limit (30),
    // or if it's explicitly set higher than the base limit, use it.
    if (user.word_limit && user.word_limit !== 30) {
        // If the custom limit is higher than what the plan offers, use the custom one.
        // Otherwise, if the plan offers more, use the plan's limit.
        if (user.word_limit > baseLimit) {
            return {
                limit: user.word_limit,
                type: 'custom'
            };
        } else if (user.is_premium) {
            // For premium users, if their custom word_limit is lower than baseLimit (500),
            // but they are premium, we should still respect the custom word_limit 
            // because it might be the specific limit of their purchased tariff (e.g., 200).
            return {
                limit: user.word_limit,
                type: 'premium_custom'
            };
        }
    }

    return {
        limit: baseLimit,
        type: planType
    };
}

/**
 * Check if text is within user's word limit
 * @param {string} text - Input text
 * @param {Object} user - User object
 * @returns {Object} - Check result
 */
function checkTextLimit(text, user) {
    const wordCount = countWords(text);
    const limitInfo = getUserWordLimit(user);

    return {
        wordCount,
        limit: limitInfo.limit,
        type: limitInfo.type,
        allowed: wordCount <= limitInfo.limit,
        exceeded: wordCount > limitInfo.limit
    };
}

/**
 * Escape string for Telegram HTML parse mode
 * @param {string} str - Input string
 * @returns {string} - Escaped string
 */
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

module.exports = {
    countWords,
    exceedsWordLimit,
    getUserWordLimit,
    checkTextLimit,
    escapeHTML
};
