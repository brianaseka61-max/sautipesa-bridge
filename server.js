const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// HARDCODED CREDENTIALS - No more environment variable errors
const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/health', (req, res) => {
    res.status(200).json({ status: "ok", message: "Bridge is active" });
});

app.post('/register', async (req, res) => {
    console.log("📥 Onboarding request received for:", req.body.shortcode);
    
    const { shortcode, business_name, consumer_key, consumer_secret, passkey } = req.body;

    try {
        const { data, error } = await supabase
            .from('businesses')
            .upsert({
                shortcode: String(shortcode),
                business_name: business_name || "SautiPesa User",
                consumer_key: consumer_key,
                consumer_secret: consumer_secret,
                passkey: passkey,
                updated_at: new Date()
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ Supabase Error:", error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ Successfully saved to Supabase!");
        res.status(201).json({ status: "success" });

    } catch (err) {
        console.error("❌ Server Crash:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Bridge live on port ${PORT}`);
});
