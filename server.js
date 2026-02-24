const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());

// --- 1. GLOBAL REQUEST LOGGER ---
// This ensures every single hit is logged, even if the route is wrong
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} request to: ${req.url}`);
    if (req.method === 'POST') {
        console.log('📦 Payload:', JSON.stringify(req.body));
    }
    next();
});

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// --- 2. ENDPOINTS ---

// Root
app.get('/', (req, res) => res.status(200).send('🚀 SautiPesa Bridge is Live and Active'));

// Health Check (Success here means Android can talk to Render)
app.get('/health', (req, res) => {
    console.log("✅ Health handshake successful");
    res.status(200).json({ status: "ok", timestamp: new Date() });
});

// Registration Logic
const handleRegistration = async (req, res) => {
    const { business_name, shortcode, consumer_key, consumer_secret, passkey } = req.body;
    
    if (!shortcode || !consumer_key || !consumer_secret) {
        console.error("⚠️ Validation Failed: Missing required fields");
        return res.status(400).json({ error: "Missing required API credentials" });
    }

    console.log(`📝 Database Write: Attempting for shortcode ${shortcode}`);

    try {
        const { error } = await supabase
            .from('businesses')
            .upsert({
                business_name: business_name || "New Business",
                shortcode: String(shortcode),
                consumer_key,
                consumer_secret,
                passkey
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ SUPABASE REJECTED:", error.message);
            return res.status(500).json({ error: error.message, hint: error.hint });
        }

        console.log("✅ SUCCESS: Business saved to database");
        res.status(201).json({ status: "success", message: "Business registered" });

    } catch (err) {
        console.error("❌ CRITICAL SERVER ERROR:", err.message);
        res.status(500).json({ error: "Internal Bridge Error" });
    }
};

// --- 3. ROUTE MAPPING ---
// Supporting every possible variation to ensure logs aren't empty
app.post('/register', handleRegistration);
app.post('/register/', handleRegistration);
app.post('/api/business/register', handleRegistration);

// --- 4. ERROR FALLBACK ---
// If the app hits a URL that doesn't exist, this will log it
app.use((req, res) => {
    console.error(`🚫 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: "Route not found. Check app URL configuration." });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    **************************************
    🚀 Bridge Server Running on Port ${PORT}
    ✅ Routes: /health, /register
    **************************************
    `);
});
