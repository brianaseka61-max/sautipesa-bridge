const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Increase limit and ensure JSON is parsed correctly
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 🔍 Health Check Route (Use this to test if Render is awake)
app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Bridge is Live and Waiting!");
});

// 💰 NEW: M-Pesa Callback Route (The Bridge to Supabase Transactions)
app.post('/callback', async (req, res) => {
    console.log("🔔 CALLBACK RECEIVED:", JSON.stringify(req.body));

    try {
        const stkCallback = req.body.Body.stkCallback;
        
        // ResultCode 0 means the transaction was successful
        if (stkCallback && stkCallback.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            
            // Extract specific values from the M-Pesa Metadata array
            const amount = metadata.find(i => i.Name === 'Amount')?.Value;
            const receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            const phone = metadata.find(i => i.Name === 'PhoneNumber')?.Value;
            const date = metadata.find(i => i.Name === 'TransactionDate')?.Value;

            console.log(`✅ Processing Payment: ${receipt} | Amount: ${amount} | From: ${phone}`);

            // Insert into Supabase 'transactions' table
            const { data, error } = await supabase
                .from('transactions')
                .insert([
                    {
                        receipt_number: receipt,
                        amount: amount,
                        phone_number: String(phone),
                        transaction_date: String(date),
                        status: 'completed',
                        raw_data: req.body // Keep full record for safety
                    }
                ]);

            if (error) {
                console.error("❌ SUPABASE INSERT ERROR:", error.message);
            } else {
                console.log("🚀 Transaction recorded in Supabase successfully.");
            }
        } else {
            console.log("⚠️ Transaction was cancelled or failed by user.");
        }

        // Always respond with 200 to Safaricom to acknowledge receipt
        res.status(200).send("Success");

    } catch (err) {
        console.error("❌ CALLBACK PROCESSING ERROR:", err.message);
        res.status(200).send("Error handled but acknowledged");
    }
});

app.post('/register', async (req, res) => {
    // 📝 Log raw body to Render logs immediately
    console.log("📥 RECEIVED BODY:", JSON.stringify(req.body));

    // Flexible extraction: Checks both standard keys and backup keys
    const shortcode = req.body.shortcode || req.body.et_shortcode;
    const business_name = req.body.business_name || req.body.et_biz_name || "New Business";
    const consumer_key = req.body.consumer_key || req.body.et_consumer_key;
    const consumer_secret = req.body.consumer_secret || req.body.et_consumer_secret;
    const passkey = req.body.passkey || req.body.et_passkey;

    // 🛑 Prevent empty data from reaching Supabase
    if (!shortcode || !consumer_key) {
        console.error("❌ REJECTED: Missing data fields. Received:", req.body);
        return res.status(400).json({ 
            error: "Missing required fields", 
            receivedKeys: Object.keys(req.body) 
        });
    }

    try {
        const { data, error } = await supabase
            .from('businesses')
            .upsert({
                shortcode: String(shortcode).trim(),
                business_name: business_name.trim(),
                consumer_key: consumer_key.trim(),
                consumer_secret: consumer_secret.trim(),
                passkey: passkey ? passkey.trim() : null,
                updated_at: new Date()
            }, { onConflict: 'shortcode' });

        if (error) {
            console.error("❌ SUPABASE ERROR:", error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log("✅ SUCCESS: Saved business", shortcode);
        res.status(201).json({ status: "success", message: "Registered " + shortcode });

    } catch (err) {
        console.error("❌ CRITICAL SERVER EXCEPTION:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SautiPesa Bridge live on port ${PORT}`);
    console.log(`🔗 Target URL: https://sautipesa-bridge.onrender.com/register`);
    console.log(`🔗 Callback URL: https://sautipesa-bridge.onrender.com/callback`);
});
