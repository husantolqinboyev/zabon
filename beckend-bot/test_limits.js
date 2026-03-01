const textUtils = require('./utils/textUtils');
const audioUtils = require('./utils/audioUtils');

const testUsers = [
    { name: 'Free User', is_premium: false, daily_limit: 3, bonus_limit: 0, word_limit: 30 },
    { name: 'Basic User (from bonus)', is_premium: false, daily_limit: 3, bonus_limit: 1, word_limit: 30 },
    { name: 'Basic User', is_premium: true, word_limit: 70 },
    { name: 'Standard User', is_premium: true, word_limit: 150 },
    { name: 'Premium User', is_premium: true, word_limit: 300 }
];

console.log('--- Word Limit Tests ---');
testUsers.forEach(u => {
    const limitInfo = textUtils.getUserWordLimit(u);
    console.log(`${u.name}: Limit=${limitInfo.limit}, Type=${limitInfo.type}`);
});

console.log('\n--- Audio Duration Limit Tests ---');
testUsers.forEach(u => {
    const limit = audioUtils.getUserAudioLimit(u);
    console.log(`${u.name}: Limit=${limit}s`);
});
