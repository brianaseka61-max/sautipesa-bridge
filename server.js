const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// 1. Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

// 2. The Connection Endpoint
app.post('/api/business/register', async (req, res) => {
    // Sauti Pesa sends these 5 specific fields
    const { business_name, shortcode, consumer_key, consumer_secret, passkey } = req.body;

    try {
        const { error } = await supabase
            .from('businesses')
            .upsert({ 
                business_name: business_name || "New Business", 
                shortcode, 
                consumer_key, 
                consumer_secret, 
                passkey 
            }, { onConflict: 'shortcode' });

        if (error) throw error;
        
        // This response tells the app the connection is officially WORKED
        res.status(201).json({ status: "success" });
    } catch (err) {
        // This tells the app specifically WHAT failed
        res.status(500).json({ status: "error", message: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Connection Bridge Active on Port ${PORT}`));
