const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.post('/register', async (req, res) => {
    // Log exactly what arrived to debug naming issues
    console.log("📥 RECEIVED BODY:", JSON.stringify(req.body));

    // Flexible extraction: Checks both standard keys and common Android UI names
    const shortcode = req.body.shortcode || req.body.et_shortcode;
    const business_name = req.body.business_name || req.body.et_biz_name || "New Business";
    const consumer_key = req.body.consumer_key || req.body.et_consumer_key;
    const consumer_secret = req.body.consumer_secret || req.body.et_consumer_secret;
    const passkey = req.body.passkey || req.body.et_passkey;

    // Validation: If the app sent nothing, don't even try Supabase
    if (!shortcode || !consumer_key) {
        console.error("❌ REJECTED: Missing Shortcode or Key in payload");
        return res.status(400).json({ error: "Missing required fields", received: req.body });
    }

    try {
        const { error } = await supabase
            .from('businesses')
            .upsert({
                shortcode: String(shortcode),
                business_name: business_name,
                consumer_key: consumer_key,
                consumer_secret: consumer_secret,
                passkey: passkey,
                updated_at: new Date()
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ SUPABASE ERROR:", error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ SUCCESS: Saved business", shortcode);
        res.status(201).json({ status: "success" });
    } catch (err) {
        console.error("❌ CRITICAL ERROR:", err.message);
        res.status(500).json({ error: "Server Exception" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Bridge live on port ${PORT}`));
