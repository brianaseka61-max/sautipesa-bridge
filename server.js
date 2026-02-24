const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.post('/register', async (req, res) => {
    // This will show us EXACTLY what the app is sending in your Render logs
    console.log("📥 Raw Body Received:", JSON.stringify(req.body));

    // Flexible extraction to catch different naming conventions
    const shortcode = req.body.shortcode || req.body.etShortcode;
    const business_name = req.body.business_name || req.body.name || "SautiPesa User";
    const consumer_key = req.body.consumer_key || req.body.key;
    const consumer_secret = req.body.consumer_secret || req.body.secret;
    const passkey = req.body.passkey;

    if (!shortcode || !consumer_key) {
        console.error("❌ Missing Required Fields:", { shortcode, consumer_key });
        return res.status(400).json({ error: "Missing shortcode or consumer_key" });
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
            console.error("❌ Supabase DB Error:", error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ Success! Business stored for shortcode:", shortcode);
        res.status(201).json({ status: "success" });
    } catch (err) {
        console.error("❌ Server Exception:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Bridge live on port ${PORT}`));
