const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Your Specific Supabase Credentials
const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
// Using Service Role Key to bypass RLS and ensure successful writes
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Request Logger
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} to ${req.url}`);
    next();
});

// Health Check
app.get('/health', (req, res) => res.status(200).json({ status: "ok", project: "SautiPesa_DB" }));

// Registration Logic
app.post('/register', async (req, res) => {
    const { shortcode, business_name, consumer_key, consumer_secret, passkey } = req.body;
    
    console.log(`📝 Database Write: Attempting for shortcode ${shortcode}`);

    try {
        const { error } = await supabase
            .from('businesses')
            .upsert({
                shortcode: String(shortcode).trim(),
                business_name: business_name || "SautiPesa Test Biz",
                consumer_key: consumer_key,
                consumer_secret: consumer_secret,
                passkey: passkey,
                updated_at: new Date()
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ SUPABASE ERROR:", error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ SUCCESS: Data saved to SautiPesa_DB");
        res.status(201).json({ status: "success", message: "Business Registered" });

    } catch (err) {
        console.error("❌ SERVER CRITICAL ERROR:", err.message);
        res.status(500).json({ error: "Internal Bridge Error" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Bridge Active on Port ${PORT}`));
