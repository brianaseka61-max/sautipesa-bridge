const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Supabase with the SERVICE_ROLE_KEY to bypass all restrictions
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

app.get('/', (req, res) => res.status(200).send('🚀 Bridge is 100% Ready'));

app.post('/api/business/register', async (req, res) => {
    const { business_name, shortcode, consumer_key, consumer_secret, passkey } = req.body;
    
    console.log(`📡 ATTEMPTING DATABASE WRITE FOR: ${shortcode}`);

    try {
        const { data, error } = await supabase
            .from('businesses')
            .upsert({
                business_name: business_name || "New Business",
                shortcode: String(shortcode),
                consumer_key,
                consumer_secret,
                passkey
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ SUPABASE REJECTED DATA:", error.message);
            console.error("DEBUG HINT:", error.hint);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ DATABASE WRITE SUCCESSFUL");
        res.status(201).json({ status: "success" });

    } catch (err) {
        console.error("❌ CRITICAL SYSTEM ERROR:", err.message);
        res.status(500).json({ error: "Internal Bridge Error" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
