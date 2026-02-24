const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- 1. GLOBAL REQUEST LOGGER ---
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} to ${req.url}`);
    if (req.method === 'POST') console.log('📦 Data:', JSON.stringify(req.body));
    next();
});

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// --- 2. ENDPOINTS ---

app.get('/', (req, res) => res.status(200).send('🚀 Bridge is Live'));

app.get('/health', (req, res) => {
    console.log("✅ Health handshake");
    res.status(200).json({ status: "ok" });
});

app.post('/register', async (req, res) => {
    const { business_name, shortcode, consumer_key, consumer_secret, passkey } = req.body;
    
    if (!shortcode) {
        return res.status(400).json({ error: "Shortcode is required" });
    }

    try {
        console.log(`📝 DB Write for: ${shortcode}`);
        
        // Finalized Upsert Logic
        const { error } = await supabase
            .from('businesses')
            .upsert({
                business_name: business_name || "New Business",
                shortcode: String(shortcode).trim(),
                consumer_key: consumer_key,
                consumer_secret: consumer_secret,
                passkey: passkey
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ SUPABASE ERROR:", error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ SUCCESS: Saved to Supabase");
        res.status(201).json({ status: "success" });

    } catch (err) {
        console.error("❌ CRITICAL ERROR:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
