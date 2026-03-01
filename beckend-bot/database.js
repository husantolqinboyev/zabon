const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

class Database {
    constructor() {
        // Initialize Supabase client
        this.supabase = createClient(
            config.SUPABASE_URL,
            config.SUPABASE_ANON_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Service client for admin operations
        this.supabaseAdmin = createClient(
            config.SUPABASE_URL,
            config.SUPABASE_SERVICE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        console.log('Connected to Supabase database');

        // Cache for leaderboard
        this.leaderboardCache = null;
        this.leaderboardLastUpdate = 0;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    }

    async initializeTables() {
        // Tables are created via SQL schema in Supabase
        console.log('Database tables initialized via SQL schema');
        await this.seedDefaultData();
    }

    async seedDefaultData() {
        try {
            // Check if tariffs exist
            const { count: tariffCount } = await this.supabase
                .from('tariffs')
                .select('*', { count: 'exact', head: true });

            if (tariffCount === 0) {
                console.log('Seeding default tariffs...');
                const defaultTariffs = [
                    { name: 'Basic', price: 15000, duration_days: 7, limit_per_day: 50, word_limit: 70 },
                    { name: 'Standart', price: 32000, duration_days: 30, limit_per_day: 200, word_limit: 150 },
                    { name: 'Premium', price: 300000, duration_days: 365, limit_per_day: 1000, word_limit: 300 }
                ];

                const { error } = await this.supabase
                    .from('tariffs')
                    .insert(defaultTariffs);

                if (error) console.error('Error seeding tariffs:', error);
            }

            // Check if bot settings exist
            const { count: settingsCount } = await this.supabase
                .from('bot_settings')
                .select('*', { count: 'exact', head: true });

            if (settingsCount === 0) {
                console.log('Seeding default bot settings...');
                const defaultSettings = [
                    { key: 'card_number', value: '5614 6868 3029 9486' },
                    { key: 'card_holder', value: 'Sanatbek Hamidov' }
                ];

                const { error } = await this.supabase
                    .from('bot_settings')
                    .insert(defaultSettings);

                if (error) console.error('Error seeding settings:', error);
            }
        } catch (error) {
            console.error('Error in seedDefaultData:', error);
        }
    }

    async getUserLimitInfo(telegramId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('used_today, daily_limit, bonus_limit')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data || { used_today: 0, daily_limit: 3, bonus_limit: 0 };
        } catch (error) {
            console.error('Error getting user limit info:', error);
            return { used_today: 0, daily_limit: 3, bonus_limit: 0 };
        }
    }

    async getUserVoice(telegramId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('tts_voice')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data ? data.tts_voice : 'en-US-AriaNeural';
        } catch (error) {
            console.error('Error getting user voice:', error);
            return 'en-US-AriaNeural';
        }
    }

    async setUserVoice(telegramId, voice) {
        try {
            const { error } = await this.supabase
                .from('users')
                .update({ tts_voice: voice })
                .eq('telegram_id', telegramId);

            if (error) throw error;
        } catch (error) {
            console.error('Error setting user voice:', error);
            throw error;
        }
    }

    async isAdmin(telegramId) {
        // First check .env ADMIN_ID list
        if (config.ADMIN_IDS && config.ADMIN_IDS.includes(String(telegramId))) {
            return true;
        }

        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('is_admin')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data ? data.is_admin : false;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }

    async isTeacher(telegramId) {
        // Admins are also considered teachers
        const adminStatus = await this.isAdmin(telegramId);
        if (adminStatus) return true;

        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('is_teacher')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data ? data.is_teacher : false;
        } catch (error) {
            console.error('Error checking teacher status:', error);
            return false;
        }
    }

    async setTeacher(telegramId, isTeacher) {
        try {
            const { error } = await this.supabase
                .from('users')
                .update({ is_teacher: isTeacher })
                .eq('telegram_id', telegramId);

            if (error) throw error;
        } catch (error) {
            console.error('Error setting teacher status:', error);
            throw error;
        }
    }

    async setAdmin(telegramId, isAdmin) {
        try {
            const { error } = await this.supabase
                .from('users')
                .update({ is_admin: isAdmin })
                .eq('telegram_id', telegramId);

            if (error) throw error;
        } catch (error) {
            console.error('Error setting admin status:', error);
            throw error;
        }
    }

    async getAdminCount() {
        try {
            const { count, error } = await this.supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('is_admin', true);

            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error getting admin count:', error);
            return 0;
        }
    }

    async checkLimit(telegramId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('used_today, daily_limit, bonus_limit, last_active')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (!data) return true;

            const lastActive = new Date(data.last_active);
            const today = new Date();

            // If last active was not today, reset used_today
            if (lastActive.toDateString() !== today.toDateString()) {
                await this.supabase
                    .from('users')
                    .update({ used_today: 0 })
                    .eq('telegram_id', telegramId);
                return true;
            }

            // Check if daily limit or bonus limit is available
            const hasDailyLimit = data.used_today < data.daily_limit;
            const hasBonusLimit = data.bonus_limit > 0;
            return hasDailyLimit || hasBonusLimit;
        } catch (error) {
            console.error('Error checking limit:', error);
            return true; // Allow on error
        }
    }

    async incrementUsage(telegramId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('used_today, daily_limit, bonus_limit')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (!data) return;

            let updateData = { last_active: new Date().toISOString() };

            if (data.used_today < data.daily_limit) {
                updateData.used_today = data.used_today + 1;
            } else if (data.bonus_limit > 0) {
                updateData.bonus_limit = data.bonus_limit - 1;
            }

            await this.supabase
                .from('users')
                .update(updateData)
                .eq('telegram_id', telegramId);
        } catch (error) {
            console.error('Error incrementing usage:', error);
            throw error;
        }
    }

    async addTestWord(word, difficulty = 'medium') {
        try {
            const { data, error } = await this.supabase
                .from('test_words')
                .insert({ word, difficulty })
                .select()
                .single();

            if (error) throw error;
            return data.id;
        } catch (error) {
            console.error('Error adding test word:', error);
            throw error;
        }
    }

    async getRandomTestWord() {
        try {
            // First get a random row by using RPC or getting count and offset
            const { count, error: countError } = await this.supabase
                .from('test_words')
                .select('*', { count: 'exact', head: true });

            if (countError) throw countError;
            if (count === 0) return null;

            const randomOffset = Math.floor(Math.random() * count);
            const { data, error } = await this.supabase
                .from('test_words')
                .select('*')
                .range(randomOffset, randomOffset)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting random test word:', error);
            return null;
        }
    }

    async getRandomTestWordByType(type) {
        try {
            // Define filter logic
            const isWord = type === 'word';

            // First get count of filtered rows
            let query = this.supabase.from('test_words').select('*', { count: 'exact', head: true });

            if (isWord) {
                // Word: either no space OR exactly 1 space (2 words max)
                // Using a more reliable logic for Supabase: word should not have more than 1 space
                // But for simplicity and matching the existing logic, we'll try to get all and filter if needed,
                // OR use multiple ilike patterns.
                query = query.or('word.not.ilike.% % %,word.not.ilike.% % % %');
            } else {
                // Text: must have at least 2 spaces (3 words or more)
                query = query.ilike('word', '% % %');
            }

            const { count, error: countError } = await query;
            if (countError) throw countError;
            if (count === 0) return null;

            // Get a random row from filtered results
            const randomOffset = Math.floor(Math.random() * count);

            let finalQuery = this.supabase.from('test_words').select('*');
            if (isWord) {
                finalQuery = finalQuery.or('word.not.ilike.% % %,word.not.ilike.% % % %');
            } else {
                finalQuery = finalQuery.ilike('word', '% % %');
            }

            const { data, error } = await finalQuery
                .range(randomOffset, randomOffset)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting random test word by type:', error);
            return null;
        }
    }

    async getRecentTestWords(limit = 20) {
        try {
            const { data, error } = await this.supabase
                .from('test_words')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting recent test words:', error);
            return [];
        }
    }

    async getRecentTestWordsByType(type, limit = 50) {
        try {
            const isWord = type === 'word';
            let query = this.supabase.from('test_words').select('*');
            if (isWord) {
                query = query.or('word.not.ilike.% % %,word.not.ilike.% % % %');
            } else {
                query = query.ilike('word', '% % %');
            }
            const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting recent test words by type:', error);
            return [];
        }
    }

    async deleteTestWord(id) {
        try {
            const { error } = await this.supabaseAdmin
                .from('test_words')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error('Error deleting test word:', error);
            throw error;
        }
    }

    async getAllUsers() {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .order('last_active', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }

    async getUsersByTariff(type = 'free', limit = 50) {
        try {
            let query = this.supabase
                .from('users')
                .select('*')
                .order('last_active', { ascending: false })
                .limit(limit);
            if (type === 'premium') {
                query = query.eq('is_premium', true);
            } else {
                query = query.eq('is_premium', false);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting users by tariff:', error);
            return [];
        }
    }

    async updateUserLimit(telegramId, limit) {
        try {
            const { error } = await this.supabase
                .from('users')
                .update({ daily_limit: limit })
                .eq('telegram_id', telegramId);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating user limit:', error);
            throw error;
        }
    }

    async getUserByTelegramId(telegramId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error getting user by telegram ID:', error);
            return null;
        }
    }

    async saveUser(userData, referrerId = null) {
        try {
            // Check if user exists
            const { data: existingUser, error: fetchError } = await this.supabase
                .from('users')
                .select('id, referred_by')
                .eq('telegram_id', userData.id)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
                throw fetchError;
            }

            if (existingUser) {
                // Update existing user
                const { error } = await this.supabase
                    .from('users')
                    .update({
                        username: userData.username,
                        first_name: userData.first_name,
                        last_name: userData.last_name,
                        language_code: userData.language_code,
                        last_active: new Date().toISOString()
                    })
                    .eq('telegram_id', userData.id);

                if (error) throw error;
                return existingUser.id;
            } else {
                // Insert new user
                const { data, error } = await this.supabase
                    .from('users')
                    .insert({
                        telegram_id: userData.id,
                        username: userData.username,
                        first_name: userData.first_name,
                        last_name: userData.last_name,
                        language_code: userData.language_code,
                        referred_by: referrerId
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Handle referral reward
                if (referrerId && String(referrerId) !== String(userData.id)) {
                    try {
                        await this.handleReferralReward(referrerId);
                    } catch (referralError) {
                        console.error('Referral reward error:', referralError);
                    }
                }

                return data.id;
            }
        } catch (error) {
            console.error('Error saving user:', error);
            throw error;
        }
    }

    async handleReferralReward(referrerId) {
        try {
            // Get current referral count
            const { data, error: fetchError } = await this.supabase
                .from('users')
                .select('referral_count, bonus_limit')
                .eq('telegram_id', referrerId)
                .single();

            if (fetchError) throw fetchError;

            const newCount = (data.referral_count || 0) + 1;
            let newBonusLimit = data.bonus_limit || 0;

            // Check if count is a multiple of 3
            if (newCount > 0 && newCount % 3 === 0) {
                newBonusLimit += 3;
            }

            // Update user
            const { error: updateError } = await this.supabase
                .from('users')
                .update({
                    referral_count: newCount,
                    bonus_limit: newBonusLimit
                })
                .eq('telegram_id', referrerId);

            if (updateError) throw updateError;
            return true;
        } catch (error) {
            console.error('Error handling referral reward:', error);
            throw error;
        }
    }

    async getReferralInfo(telegramId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('referral_count, daily_limit, bonus_limit')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data || { referral_count: 0, daily_limit: 3, bonus_limit: 0 };
        } catch (error) {
            console.error('Error getting referral info:', error);
            return { referral_count: 0, daily_limit: 3, bonus_limit: 0 };
        }
    }

    // --- Settings Management ---
    async setSetting(key, value) {
        try {
            const { error } = await this.supabase
                .from('bot_settings')
                .upsert({ key, value });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error setting setting:', error);
            throw error;
        }
    }

    async getSetting(key) {
        try {
            const { data, error } = await this.supabase
                .from('bot_settings')
                .select('value')
                .eq('key', key)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data ? data.value : null;
        } catch (error) {
            console.error('Error getting setting:', error);
            return null;
        }
    }

    // --- Tariff Management ---
    async addTariff(name, price, duration, limit, wordLimit = 30) {
        try {
            const { error } = await this.supabase
                .from('tariffs')
                .insert({
                    name,
                    price,
                    duration_days: duration,
                    limit_per_day: limit,
                    word_limit: wordLimit
                });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error adding tariff:', error);
            throw error;
        }
    }

    async getTariffs() {
        try {
            const { data, error } = await this.supabase
                .from('tariffs')
                .select('*')
                .order('price', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting tariffs:', error);
            return [];
        }
    }

    async deleteTariff(id) {
        try {
            const { error } = await this.supabase
                .from('tariffs')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting tariff:', error);
            throw error;
        }
    }

    // --- Payment Management ---
    async createPaymentRequest(userId, tariffId, photoFileId, details) {
        try {
            const { data, error } = await this.supabase
                .from('payments')
                .insert({
                    user_id: userId,
                    tariff_id: tariffId,
                    photo_file_id: photoFileId,
                    payment_details: details
                })
                .select()
                .single();

            if (error) throw error;
            return data.id;
        } catch (error) {
            console.error('Error creating payment request:', error);
            throw error;
        }
    }

    async getPendingPayments() {
        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select(`
                    *,
                    user:users!user_id(first_name, username),
                    tariff:tariffs!tariff_id(name, price, word_limit)
                `)
                .eq('status', 'pending');

            if (error) throw error;
            return data.map(item => ({
                ...item,
                first_name: item.user?.first_name,
                username: item.user?.username,
                tariff_name: item.tariff?.name,
                tariff_price: item.tariff?.price,
                tariff_word_limit: item.tariff?.word_limit
            })) || [];
        } catch (error) {
            console.error('Error getting pending payments:', error);
            return [];
        }
    }

    async getPaymentById(id) {
        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select(`
                    *,
                    user:users!user_id(telegram_id),
                    tariff:tariffs!tariff_id(duration_days, limit_per_day, word_limit)
                `)
                .eq('id', id)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (data) {
                return {
                    ...data,
                    telegram_id: data.user?.telegram_id,
                    duration_days: data.tariff?.duration_days,
                    limit_per_day: data.tariff?.limit_per_day,
                    word_limit: data.tariff?.word_limit
                };
            }
            return data;
        } catch (error) {
            console.error('Error getting payment by ID:', error);
            return null;
        }
    }

    async updatePaymentStatus(id, status) {
        try {
            const { error } = await this.supabaseAdmin
                .from('payments')
                .update({ status })
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error updating payment status:', error);
            throw error;
        }
    }

    async approvePremium(userId, days, dailyLimit, wordLimit = 30) {
        try {
            const until = new Date();
            until.setDate(until.getDate() + days);

            const { error } = await this.supabaseAdmin
                .from('users')
                .update({
                    is_premium: true,
                    premium_until: until.toISOString(),
                    daily_limit: dailyLimit,
                    word_limit: wordLimit
                })
                .eq('id', userId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error approving premium:', error);
            throw error;
        }
    }

    async checkPremiumStatus(telegramId) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('is_premium, premium_until')
                .eq('telegram_id', telegramId)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (!data || !data.is_premium) return false;

            const until = new Date(data.premium_until);
            if (until < new Date()) {
                // Premium expired
                await this.supabase
                    .from('users')
                    .update({
                        is_premium: false,
                        daily_limit: 3,
                        word_limit: 30
                    })
                    .eq('telegram_id', telegramId);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error checking premium status:', error);
            return false;
        }
    }

    async getAdmins() {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('telegram_id')
                .eq('is_admin', true);

            if (error) throw error;

            let admins = data || [];
            // Add admins from config if not already in the list
            if (config.ADMIN_IDS) {
                config.ADMIN_IDS.forEach(id => {
                    if (!admins.find(a => String(a.telegram_id) === String(id))) {
                        admins.push({ telegram_id: parseInt(id) });
                    }
                });
            }

            return admins;
        } catch (error) {
            console.error('Error getting admins:', error);
            return [];
        }
    }

    async saveAssessment(userId, assessmentData) {
        try {
            const { data, error } = await this.supabase
                .from('assessments')
                .insert({
                    user_id: userId,
                    type: assessmentData.type || 'general',
                    audio_duration: assessmentData.audioDuration,
                    overall_score: assessmentData.overallScore || 0,
                    accuracy_score: assessmentData.accuracyScore || 0,
                    fluency_score: assessmentData.fluencyScore || 0,
                    completeness_score: assessmentData.completenessScore || 0,
                    prosody_score: assessmentData.prosodyScore || 0,
                    word_accuracy: assessmentData.wordAccuracy || 0,
                    transcription: assessmentData.transcription || '',
                    target_text: assessmentData.target_text || '',
                    feedback: assessmentData.feedback || '',
                    english_level: assessmentData.englishLevel || ''
                })
                .select()
                .single();

            if (error) throw error;
            return data.id;
        } catch (error) {
            console.error('Error saving assessment:', error);
            throw error;
        }
    }

    async getLastAssessment(telegramId) {
        try {
            const { data, error } = await this.supabase
                .from('assessments')
                .select(`
                    *,
                    user:users(telegram_id)
                `)
                .eq('user.telegram_id', telegramId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch (error) {
            console.error('Error getting last assessment:', error);
            return null;
        }
    }

    async getUserStats(telegramId) {
        try {
            // Get user first
            const user = await this.getUserByTelegramId(telegramId);
            if (!user) {
                return {
                    total_assessments: 0,
                    avg_overall: 0,
                    avg_accuracy: 0,
                    avg_fluency: 0
                };
            }

            // Ensure user.id is a valid UUID
            if (!user.id || typeof user.id !== 'string') {
                console.error('Invalid user ID:', user.id);
                return {
                    total_assessments: 0,
                    avg_overall: 0,
                    avg_accuracy: 0,
                    avg_fluency: 0
                };
            }

            const { data, error } = await this.supabase
                .from('assessments')
                .select('overall_score, accuracy_score, fluency_score')
                .eq('user_id', user.id);

            if (error) throw error;

            if (!data || data.length === 0) {
                return {
                    total_assessments: 0,
                    avg_overall: 0,
                    avg_accuracy: 0,
                    avg_fluency: 0
                };
            }

            const totalAssessments = data.length;
            const avgOverall = data.reduce((sum, a) => sum + (a.overall_score || 0), 0) / totalAssessments;
            const avgAccuracy = data.reduce((sum, a) => sum + (a.accuracy_score || 0), 0) / totalAssessments;
            const avgFluency = data.reduce((sum, a) => sum + (a.fluency_score || 0), 0) / totalAssessments;

            return {
                total_assessments: totalAssessments,
                avg_overall: avgOverall,
                avg_accuracy: avgAccuracy,
                avg_fluency: avgFluency
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            return {
                total_assessments: 0,
                avg_overall: 0,
                avg_accuracy: 0,
                avg_fluency: 0
            };
        }
    }

    async logApiUsage(modelName, promptTokens, candidatesTokens, totalTokens, requestType = 'assessment') {
        try {
            const { error } = await this.supabase
                .from('api_usage')
                .insert({
                    model_name: modelName,
                    prompt_tokens: promptTokens,
                    candidates_tokens: candidatesTokens,
                    total_tokens: totalTokens,
                    request_type: requestType
                });

            if (error) throw error;
        } catch (error) {
            console.error('Error logging API usage:', error);
            throw error;
        }
    }

    async getApiStats() {
        try {
            const { data, error } = await this.supabase
                .from('api_usage')
                .select('model_name, prompt_tokens, candidates_tokens, total_tokens');

            if (error) throw error;
            if (!data || data.length === 0) return [];

            // Group by model_name in JavaScript
            const stats = data.reduce((acc, item) => {
                const name = item.model_name || 'unknown';
                if (!acc[name]) {
                    acc[name] = {
                        model_name: name,
                        total_requests: 0,
                        total_prompt_tokens: 0,
                        total_candidates_tokens: 0,
                        total_tokens: 0
                    };
                }
                acc[name].total_requests += 1;
                acc[name].total_prompt_tokens += (item.prompt_tokens || 0);
                acc[name].total_candidates_tokens += (item.candidates_tokens || 0);
                acc[name].total_tokens += (item.total_tokens || 0);
                return acc;
            }, {});

            return Object.values(stats);
        } catch (error) {
            console.error('Error getting API stats:', error);
            return [];
        }
    }

    async getTotalUserCount() {
        try {
            const { count, error } = await this.supabase
                .from('users')
                .select('*', { count: 'exact', head: true });

            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error getting total user count:', error);
            return 0;
        }
    }

    async getMonthlyUsers() {
        try {
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 1);

            const { count, error } = await this.supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startDate.toISOString());

            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error getting monthly users:', error);
            return 0;
        }
    }

    // --- Teacher-Student Management ---
    async assignStudentToTeacher(teacherId, studentId) {
        try {
            const { error } = await this.supabase
                .from('teacher_students')
                .insert({
                    teacher_id: teacherId,
                    student_id: studentId
                });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error assigning student to teacher:', error);
            throw error;
        }
    }

    async getUserById(id) {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting user by ID:', error);
            return null;
        }
    }

    async getTestWordById(id) {
        try {
            const { data, error } = await this.supabase
                .from('test_words')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting test word by ID:', error);
            return null;
        }
    }

    async getTeachersAndAdmins() {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .or('is_teacher.eq.true,is_admin.eq.true');

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting teachers and admins:', error);
            return [];
        }
    }

    async getGeneralStats() {
        try {
            const [users, assessments, words] = await Promise.all([
                this.supabase.from('users').select('*', { count: 'exact', head: true }),
                this.supabase.from('assessments').select('*', { count: 'exact', head: true }),
                this.supabase.from('test_words').select('*', { count: 'exact', head: true })
            ]);

            return {
                total_users: users.count || 0,
                total_assessments: assessments.count || 0,
                total_words: words.count || 0
            };
        } catch (error) {
            console.error('Error getting general stats:', error);
            return { total_users: 0, total_assessments: 0, total_words: 0 };
        }
    }

    async getRecentAssessments(limit = 10) {
        try {
            const { data, error } = await this.supabase
                .from('assessments')
                .select(`
                    *,
                    users!inner(first_name, username)
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return data.map(item => ({
                ...item,
                first_name: item.users.first_name,
                username: item.users.username
            }));
        } catch (error) {
            console.error('Error getting recent assessments:', error);
            return [];
        }
    }

    async removeStudentFromTeacher(teacherTelegramId, studentId) {
        try {
            // Get teacher record id
            const teacher = await this.getUserByTelegramId(teacherTelegramId);
            if (!teacher) throw new Error('Teacher not found');

            const { error } = await this.supabase
                .from('teacher_students')
                .delete()
                .eq('teacher_id', teacher.id)
                .eq('student_id', studentId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing student from teacher:', error);
            throw error;
        }
    }

    async getTeacherStudents(teacherId) {
        try {
            const { data, error } = await this.supabase
                .from('teacher_students')
                .select(`
                    student:users!student_id(*)
                `)
                .eq('teacher_id', teacherId)
                .eq('status', 'active');

            if (error) throw error;
            return data ? data.map(item => item.student) : [];
        } catch (error) {
            console.error('Error getting teacher students:', error);
            return [];
        }
    }

    async getStudentTeachers(studentId) {
        try {
            const { data, error } = await this.supabase
                .from('teacher_students')
                .select(`
                    teacher:users!teacher_id(*)
                `)
                .eq('student_id', studentId)
                .eq('status', 'active');

            if (error) throw error;
            return data ? data.map(item => item.teacher) : [];
        } catch (error) {
            console.error('Error getting student teachers:', error);
            return [];
        }
    }

    async removeStudentFromTeacher(teacherId, studentId) {
        try {
            const { error } = await this.supabase
                .from('teacher_students')
                .update({ status: 'inactive' })
                .eq('teacher_id', teacherId)
                .eq('student_id', studentId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing student from teacher:', error);
            throw error;
        }
    }

    async getStudentTasks(studentId, status = null) {
        try {
            let query = this.supabase
                .from('student_tasks')
                .select(`
                    *,
                    teacher:users!teacher_id(first_name, username),
                    assessment:assessments(*)
                `)
                .eq('student_id', studentId);

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting student tasks:', error);
            return [];
        }
    }

    async getTeacherTasks(teacherId, status = null) {
        try {
            let query = this.supabase
                .from('student_tasks')
                .select(`
                    *,
                    student:users!student_id(first_name, username),
                    assessment:assessments(*)
                `)
                .eq('teacher_id', teacherId);

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting teacher tasks:', error);
            return [];
        }
    }

    async getTaskById(taskId) {
        try {
            const { data, error } = await this.supabase
                .from('student_tasks')
                .select(`
                    *,
                    teacher:users!teacher_id(first_name, username, telegram_id),
                    assessment:assessments(*)
                `)
                .eq('id', taskId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data;
        } catch (error) {
            console.error('Error getting task by ID:', error);
            return null;
        }
    }

    async createTask(teacherId, studentId, taskText, taskType = 'pronunciation', difficulty = 'medium', dueDate = null) {
        return this.createStudentTask(teacherId, studentId, taskText, taskType, difficulty, dueDate);
    }

    async createStudentTask(teacherId, studentId, taskText, taskType = 'pronunciation', difficulty = 'medium', dueDate = null) {
        try {
            const { data, error } = await this.supabase
                .from('student_tasks')
                .insert({
                    teacher_id: teacherId,
                    student_id: studentId,
                    task_text: taskText,
                    task_type: taskType,
                    difficulty: difficulty,
                    due_date: dueDate
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating student task:', error);
            throw error;
        }
    }

    async submitTask(taskId, assessmentId) {
        return this.updateStudentTask(taskId, {
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            assessment_id: assessmentId
        });
    }

    async gradeTask(taskId, status = 'graded') {
        return this.updateStudentTask(taskId, { status });
    }

    async updateStudentTask(taskId, updates) {
        try {
            const { error } = await this.supabase
                .from('student_tasks')
                .update(updates)
                .eq('id', taskId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error updating student task:', error);
            throw error;
        }
    }

    async deleteTask(taskId) {
        return this.deleteStudentTask(taskId);
    }

    async deleteStudentTask(taskId) {
        try {
            const { error } = await this.supabase
                .from('student_tasks')
                .delete()
                .eq('id', taskId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting student task:', error);
            throw error;
        }
    }

    async getLeaderboard(limit = 10, minAssessments = 5) {
        try {
            const now = Date.now();
            if (this.leaderboardCache && (now - this.leaderboardLastUpdate < this.CACHE_DURATION)) {
                return this.leaderboardCache.filter(u => u.total >= minAssessments).slice(0, limit);
            }

            const { data, error } = await this.supabase
                .from('assessments')
                .select(`
                    overall_score,
                    user_id,
                    users (
                        first_name,
                        username
                    )
                `);

            if (error) throw error;
            if (!data || data.length === 0) return [];

            const userStats = data.reduce((acc, item) => {
                const userId = item.user_id;
                if (!acc[userId]) {
                    acc[userId] = {
                        id: userId,
                        name: item.users?.first_name || 'Foydalanuvchi',
                        username: item.users?.username,
                        total: 0,
                        sumOverall: 0
                    };
                }
                acc[userId].total += 1;
                acc[userId].sumOverall += (item.overall_score || 0);
                return acc;
            }, {});

            this.leaderboardCache = Object.values(userStats)
                .map(u => ({
                    ...u,
                    avgOverall: u.sumOverall / u.total,
                    // Yangi ball: o'rtacha ball * 0.7 + foydalanish soni / 50 * 30
                    finalScore: (u.sumOverall / u.total) * 0.7 + Math.min(u.total / 50, 1) * 30
                }))
                .sort((a, b) => b.finalScore - a.finalScore);

            this.leaderboardLastUpdate = now;

            return this.leaderboardCache.filter(u => u.total >= minAssessments).slice(0, limit);
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            return [];
        }
    }

    async getTotalApiUsage() {
        try {
            const { data, error } = await this.supabase
                .from('api_usage')
                .select('prompt_tokens, candidates_tokens, total_tokens');

            if (error) throw error;

            if (!data || data.length === 0) {
                return { total_requests: 0, total_prompt_tokens: 0, total_candidates_tokens: 0, total_tokens: 0 };
            }

            return {
                total_requests: data.length,
                total_prompt_tokens: data.reduce((sum, item) => sum + (item.prompt_tokens || 0), 0),
                total_candidates_tokens: data.reduce((sum, item) => sum + (item.candidates_tokens || 0), 0),
                total_tokens: data.reduce((sum, item) => sum + (item.total_tokens || 0), 0)
            };
        } catch (error) {
            console.error('Error getting total API usage:', error);
            return { total_requests: 0, total_prompt_tokens: 0, total_candidates_tokens: 0, total_tokens: 0 };
        }
    }
}

module.exports = new Database();
