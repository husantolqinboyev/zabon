const database = require('../database');

async function setupDefaultTariffs() {
    try {
        console.log('Setting up default tariffs...');
        
        // Clear existing tariffs using Supabase
        const { error: deleteError } = await database.supabase
            .from('tariffs')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        
        if (deleteError) throw deleteError;
        
        // Add default tariffs
        const tariffs = [
            { name: 'Basic', price: 30000, duration: 30, limit: 10, wordLimit: 70 },
            { name: 'Standart', price: 50000, duration: 30, limit: 30, wordLimit: 200 },
            { name: 'Premium', price: 100000, duration: 30, limit: 100, wordLimit: 500 }
        ];
        
        for (const tariff of tariffs) {
            await database.addTariff(
                tariff.name,
                tariff.price,
                tariff.duration,
                tariff.limit,
                tariff.wordLimit
            );
            console.log(`✅ Added tariff: ${tariff.name} (${tariff.wordLimit} words)`);
        }
        
        console.log('🎉 Default tariffs setup completed!');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error setting up tariffs:', error);
        process.exit(1);
    }
}

setupDefaultTariffs();
