const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Bridge is Live and Monitoring!");
});

// --- FORCE LOGGING SYNC ROUTE ---
app.post('/sync', async (req, res) => {
    // THIS WILL SHOW IN YOUR RENDER LOGS IMMEDIATELY
    console.log("-----------------------------------------");
    console.log("📡 ALERT: Received a Sync Request from the App!");
    
    const authHeader = req.headers.authorization;
    const syncToken = "Bearer sauti_pro_secure_sync_2026";

    if (!authHeader || authHeader !== syncToken) {
        console.log("❌ AUTH FAILURE: Token mismatch or missing.");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const salesList = req.body;
    console.log(`📦 Data Payload Size: ${Array.isArray(salesList) ? salesList.length : 'Not an array'}`);

    if (!Array.isArray(salesList) || salesList.length === 0) {
        return res.status(400).json({ error: 'Invalid data format' });
    }

    try {
        const sanitizedData = salesList.map(sale => ({
            ...sale,
            is_synced: 1 
        }));

        const { error } = await supabase
            .from('sales_history')
            .upsert(sanitizedData, { onConflict: 'id' });

        if (error) {
            console.error("❌ SUPABASE ERROR:", error.message);
            throw error;
        }

        console.log("✅ SUCCESS: Data written to Supabase.");
        res.status(200).json({ status: "success", count: salesList.length });
    } catch (err) {
        console.error("❌ SERVER ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- CALLBACK ROUTE ---
app.post('/callback', async (req, res) => {
    res.status(200).send("Success"); 
    try {
        const stkCallback = req.body?.Body?.stkCallback;
        if (stkCallback?.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            const payload = {
                receipt_number: String(metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value),
                amount: parseFloat(metadata.find(i => i.Name === 'Amount')?.Value),
                phone_number: String(metadata.find(i => i.Name === 'PhoneNumber')?.Value),
                transaction_date: new Date().toISOString()
            };
            await supabase.from('transactions').insert([payload]);
        }
    } catch (err) {
        console.error("❌ Callback Error:", err.message);
    }
});

const PORT = 10000; 
app.listen(PORT, '0.0.0.0', () => { console.log(`📡 Bridge listening on Port ${PORT}`); });
