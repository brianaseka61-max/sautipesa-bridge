const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Bridge is Live!");
});

app.post('/callback', async (req, res) => {
    console.log("💰 CALLBACK RECEIVED:", JSON.stringify(req.body));

    try {
        const stkCallback = req.body?.Body?.stkCallback;
        if (stkCallback?.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            
            // Map the data to the exact column names required by your Supabase table
            const payload = {
                receipt: metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value, // Changed to match your 'receipt' column
                amount: parseFloat(metadata.find(i => i.Name === 'Amount')?.Value),
                phone_number: String(metadata.find(i => i.Name === 'PhoneNumber')?.Value),
                transaction_date: new Date().toISOString()
            };

            console.log(`✅ Attempting Supabase Save with Receipt: ${payload.receipt}`);

            const { error } = await supabase.from('transactions').insert([payload]);

            if (error) {
                console.error("❌ SUPABASE ERROR:", error.message);
            } else {
                console.log("🚀 SUCCESS: Saved to Supabase!");
            }
        }
        res.status(200).send("Success");
    } catch (err) {
        console.error("❌ ERROR:", err.message);
        res.status(200).send("Error Handled");
    }
});

const PORT = 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Bridge listening on Port ${PORT}`);
});
