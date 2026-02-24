const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- LOGGING MIDDLEWARE ---
// This prints every request to your Render logs for easy debugging
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} to ${req.url}`);
    if (req.method === 'POST') console.log('📦 Data Received:', JSON.stringify(req.body));
    next();
});

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// 1. ROOT ROUTE (For manual browser testing)
app.get('/', (req, res) => res.status(200).send('🚀 SautiPesa Bridge is Live'));

// 2. HEALTH CHECK (What ServerLinkActivity looks for)
app.get('/health', (req, res) => {
    console.log("✅ Health check received from App");
    res.status(200).json({ status: "ok" });
});

// 3. REGISTRATION HANDLER
const handleRegistration = async (req, res) => {
    const { business_name, shortcode, consumer_key, consumer_secret, passkey } = req.body;
    
    console.log(`📝 Attempting DB write for: ${shortcode}`);

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

        console.log("✅ SUCCESS: Business Registered in Supabase");
        res.status(201).json({ status: "success" });

    } catch (err) {
        console.error("❌ CRITICAL SERVER ERROR:", err.message);
        res.status(500).json({ error: "Internal Bridge Error" });
    }
};

// Supporting both path styles for maximum compatibility
app.post('/register', handleRegistration);
app.post('/api/business/register', handleRegistration);

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Bridge running on port ${PORT}`);
});
