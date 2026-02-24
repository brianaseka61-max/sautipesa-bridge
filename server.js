const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// 1. Initialize Supabase with Debugging
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERROR: Missing Supabase Env Variables!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ROOT ROUTE
app.get('/', (req, res) => {
    res.status(200).send('🚀 Sauti Pesa Bridge is Online and Fully Customized!');
});

// --- THE FINAL BUSINESS REGISTRATION FIX ---
app.post('/api/business/register', async (req, res) => {
    const { 
        business_name = "Unnamed Business", 
        shortcode, 
        consumer_key, 
        consumer_secret, 
        passkey 
    } = req.body;

    console.log(`📝 Registering: ${shortcode}`);

    try {
        // We use a clean object to avoid sending columns that might not exist yet
        const insertData = { 
            business_name, 
            shortcode, 
            consumer_key, 
            consumer_secret, 
            passkey 
        };

        const { data, error } = await supabase
            .from('businesses')
            .upsert(insertData, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ Database Error:", error.message);
            // This sends the EXACT problem to your phone screen
            return res.status(500).json({ 
                status: "error", 
                message: `DB Error: ${error.message}`, 
                hint: error.hint || "Check if column names match exactly" 
            });
        }
        
        res.status(201).json({ status: "success", message: "Business Connected!" });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
