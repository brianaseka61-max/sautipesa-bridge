const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- DEBUG LOGGER ---
// This will show every request in your Render logs so you know the app is connected
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] Incoming ${req.method} to ${req.url}`);
    next();
});

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// 1. ROOT ROUTE
app.get('/', (req, res) => res.status(200).send('🚀 Bridge is 100% Ready'));

// 2. HEALTH CHECK ROUTE (Required for ServerLinkActivity.java)
app.get('/health', (req, res) => {
    console.log("✅ Health check passed: App and Server are talking!");
    res.status(200).json({ status: "ok", message: "Bridge is Active" });
});

// 3. BUSINESS REGISTRATION
app.post('/api/business/register', async (req, res) => {
    const { business_name, shortcode, consumer_key, consumer_secret, passkey } = req.body;
    
    console.log(`📝 ATTEMPTING DATABASE WRITE FOR: ${shortcode}`);

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
