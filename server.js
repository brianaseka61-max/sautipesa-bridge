const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Multi-Tenant Bridge is Live!");
});

app.post('/register', async (req, res) => {
    const { business_name, shortcode, consumer_key, consumer_secret, passkey, status } = req.body;
    try {
        const { error } = await supabase.from('merchants').upsert([{
            shortcode: String(shortcode).trim(),
            business_name, consumer_key, consumer_secret, passkey,
            status: status || 'Active'
        }], { onConflict: 'shortcode' });

        if (error) throw error;
        res.status(200).json({ message: "Registration successful" });
    } catch (err) {
        console.error("❌ REGISTRATION ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/callback', async (req, res) => {
    res.status(200).send("Success"); 
    
    try {
        const stkCallback = req.body?.Body?.stkCallback;
        if (stkCallback?.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            const rawID = stkCallback.MerchantRequestID || "";
            const businessShortcode = String(rawID.split('-')[0]).trim();

            console.log(`📡 SYNCING MERCHANT: ${businessShortcode}`);

            // 1. Force Upsert
            await supabase.from('merchants').upsert([{ 
                shortcode: businessShortcode, 
                business_name: "Verified Merchant",
                status: 'Active' 
            }], { onConflict: 'shortcode' });

            // 2. WAIT & VERIFY (Operational Retry)
            // This ensures the DB index is ready before the transaction insert
            let merchantConfirmed = false;
            for (let i = 0; i < 3; i++) {
                const { data } = await supabase.from('merchants').select('status').eq('shortcode', businessShortcode).single();
                if (data) { merchantConfirmed = true; break; }
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!merchantConfirmed) return console.error("❌ MERCHANT NOT READY IN DB");

            const payload = {
                receipt_number: metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value + "_" + Math.floor(Math.random() * 9999), 
                amount: parseFloat(metadata.find(i => i.Name === 'Amount')?.Value),
                phone_number: String(metadata.find(i => i.Name === 'PhoneNumber')?.Value),
                sender_name: String(metadata.find(i => i.Name === 'sender_name')?.Value || "M-Pesa Customer"),
                account: String(metadata.find(i => i.Name === 'BillRefNumber')?.Value || "N/A"), 
                business_shortcode: businessShortcode,
                transaction_date: new Date().toISOString()
            };

            const { error: insError } = await supabase.from('transactions').insert([payload]);
            
            if (insError) {
                console.error(`❌ DB REJECTED [${businessShortcode}]:`, insError.message);
            } else {
                console.log(`🚀 SUCCESS: Saved for Business ${businessShortcode}`);
            }
        }
    } catch (err) {
        console.error("❌ CALLBACK ERROR:", err.message);
    }
});

const PORT = 10000; 
app.listen(PORT, '0.0.0.0', () => { console.log(`📡 Bridge listening on Port ${PORT}`); });
