const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Root & Health Checks
app.get('/', (req, res) => res.send('Bridge Active'));
app.get('/health', (req, res) => res.json({ status: "ok" }));

// Onboarding Route
app.post('/register', async (req, res) => {
    console.log("📥 Incoming Data:", req.body);
    const { shortcode, business_name, consumer_key, consumer_secret, passkey } = req.body;

    try {
        const { error } = await supabase.from('businesses').upsert({
            shortcode: String(shortcode),
            business_name,
            consumer_key,
            consumer_secret,
            passkey
        }, { onConflict: 'shortcode' });

        if (error) throw error;
        res.status(201).json({ status: "success" });
    } catch (err) {
        console.error("❌ DB Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server ready on port ${PORT}`));
