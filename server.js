const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// --- 📡 DEBUGGING MIDDLEWARE ---
app.use((req, res, next) => {
    console.log(`🚀 [${new Date().toISOString()}] ${req.method} to ${req.url}`);
    next();
});

// 1. HEALTH CHECK (For ServerLinkActivity)
app.get('/health', (req, res) => {
    res.status(200).json({ status: "ok", message: "Bridge is Active" });
});

// 2. ONBOARDING REGISTRATION
app.post('/register', async (req, res) => {
    const { business_name, shortcode, consumer_key, consumer_secret, passkey } = req.body;
    
    console.log(`📥 Received registration for shortcode: ${shortcode}`);

    try {
        // Ensure shortcode is treated as a string to match Supabase schema
        const { error } = await supabase
            .from('businesses')
            .upsert({
                business_name: business_name || "New Business",
                shortcode: String(shortcode),
                consumer_key: consumer_key,
                consumer_secret: consumer_secret,
                passkey: passkey
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ Supabase Error:", error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ Database write successful!");
        res.status(201).json({ status: "success" });

    } catch (err) {
        console.error("❌ Server Crash:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Bridge running on port ${PORT}`));
