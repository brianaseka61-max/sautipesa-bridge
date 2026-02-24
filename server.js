const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Root Route
app.get('/', (req, res) => {
    res.status(200).send('🚀 Sauti Pesa Bridge is Online!');
});

// Business Registration
app.post('/api/business/register', async (req, res) => {
    const { business_name = "New Business", shortcode, consumer_key, consumer_secret, passkey } = req.body;
    try {
        const { data, error } = await supabase
            .from('businesses')
            .upsert({ 
                business_name, 
                shortcode, 
                consumer_key, 
                consumer_secret, 
                passkey 
            }, { onConflict: 'shortcode' });

        if (error) throw error;
        res.status(201).json({ status: "success", message: "Business Registered" });
    } catch (err) {
        console.error("Registration Error:", err.message);
        res.status(500).json({ status: "error", details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
