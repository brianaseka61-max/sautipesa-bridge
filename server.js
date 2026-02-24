const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());

// --- HARDCODED CREDENTIALS FOR PRODUCTION ---
const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
// Using the Service Role Key you provided earlier to bypass all permission issues
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/health', (req, res) => {
    res.status(200).json({ status: "ok", message: "SautiPesa Bridge is Live" });
});

app.post('/register', async (req, res) => {
    console.log("📥 Received onboarding request...");
    const { shortcode, business_name, consumer_key, consumer_secret, passkey } = req.body;

    try {
        const { data, error } = await supabase
            .from('businesses')
            .upsert({
                shortcode: String(shortcode),
                business_name: business_name || "New Business",
                consumer_key: consumer_key,
                consumer_secret: consumer_secret,
                passkey: passkey,
                updated_at: new Date()
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ Supabase Insert Error:", error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ Data saved to Supabase successfully!");
        res.status(201).json({ status: "success" });

    } catch (err) {
        console.error("❌ Critical Server Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SautiPesa Bridge running on port ${PORT}`);
});
