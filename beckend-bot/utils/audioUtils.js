/**
 * Get audio duration limit for user (in seconds)
 * @param {Object} user - User object from database
 * @returns {number} - Audio duration limit in seconds
 */
function getUserAudioLimit(user) {
    const limits = {
        free: 45,
        basic: 90,     // 1.5 min
        standard: 150,  // 2.5 min
        premium: 240    // 4 min
    };
    
    if (user.is_premium) {
        // We'll determine the type of premium by the word_limit if possible, 
        // or just use premium if it's the highest.
        // Based on user request, if they are premium, we give them 240s.
        // However, if standard is a separate premium tier, we check word_limit.
        
        if (user.word_limit >= 300) return limits.premium;
        if (user.word_limit >= 150) return limits.standard;
        if (user.word_limit >= 70) return limits.basic;
        
        return limits.premium; // Default for premium if unknown
    }
    
    // For free users, check if they have bonus limits which might indicate a "basic" status 
    // in the previous logic (daily_limit + bonus_limit > 3)
    const totalDailyLimit = (user.daily_limit || 0) + (user.bonus_limit || 0);
    if (totalDailyLimit > 3) {
        return limits.basic;
    }

    return limits.free;
}

module.exports = {
    getUserAudioLimit
};
