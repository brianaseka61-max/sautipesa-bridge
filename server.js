const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
// High limit to ensure bulk syncs (like inventory) don't get cut off
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Omni-Bridge is Live!");
});

/**
 * 🛠️ OMNI-ROUTING LOGIC
 * This block catches requests to /sales_history, /debts, /products, etc.
 * and routes them to the correct Supabase table.
 */
app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    const data = req.body;
    
    // Log the incoming traffic so you see it in Render Live Logs
    console.log("-----------------------------------------");
    console.log(`📡 OMNI-SYNC: Incoming [${targetTable}]`);
    console.log(`📦 Records: ${Array.isArray(data) ? data.length : 1}`);

    try {
        // Map common app routes to specific Supabase tables if names differ
        let supabaseTable = targetTable;
        if (targetTable === 'mpesa_transactions') supabaseTable = 'mpesa_sales';

        const { error } = await supabase
            .from(supabaseTable)
            .upsert(data, { onConflict: 'id' });

        if (error) {
            console.error(`❌ SUPABASE ERROR [${supabaseTable}]:`, error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ SUCCESS: Synced to ${supabaseTable}`);
        res.status(200).json({ status: "success", table: supabaseTable });
    } catch (err) {
        console.error("❌ CRITICAL BRIDGE ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- MERCHANT REGISTRATION ---
app.post('/register', async (req, res) => {
    const merchantData = req.body;
    try {
        const { error } = await supabase.from('merchants').upsert([merchantData], { onConflict: 'shortcode' });
        if (error) throw error;
        console.log(`🏢 Merchant Registered: ${merchantData.business_name}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MPESA CALLBACK ---
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
                transaction_date: new Date().toISOString(),
                merchant_shortcode: req.query.shortcode || "174379" 
            };
            await supabase.from('transactions').insert([payload]);
            console.log("💰 M-Pesa Payment Logged.");
        }
    } catch (err) {
        console.error("❌ Callback Error:", err.message);
    }
});

const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`📡 SautiPesa Omni-Bridge listening on Port ${PORT}`); 
});
