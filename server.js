const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

// RLS UPDATE: We use the Service Role key here so the server can 'Administer' all merchants
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Bridge is Live and Monitoring!");
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

// --- UPDATED SYNC ROUTE FOR SALES HISTORY ---
app.post('/sync', async (req, res) => {
    const authHeader = req.headers.authorization;
    const syncToken = "Bearer sauti_pro_secure_sync_2026";

    if (!authHeader || authHeader !== syncToken) {
        console.error("❌ SYNC ERROR: Unauthorized attempt");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const salesList = req.body;

    if (!Array.isArray(salesList) || salesList.length === 0) {
        return res.status(400).json({ error: 'Invalid data format: Expected an array of sales.' });
    }

    try {
        console.log(`📡 SYNC START: Processing ${salesList.length} records.`);

        // Upsert to Supabase
        const { data, error } = await supabase
            .from('sales_history')
            .upsert(salesList, { onConflict: 'id' });

        if (error) {
            console.error("❌ SUPABASE SYNC ERROR DETAILS:", JSON.stringify(error, null, 2));
            throw error;
        }

        console.log("✅ SYNC SUCCESS: sales_history updated.");
        res.status(200).json({ status: "success", count: salesList.length });
    } catch (err) {
        console.error("❌ SYNC DB ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- UPDATED CALLBACK ROUTE ---
app.post('/callback', async (req, res) => {
    res.status(200).send("Success"); 
    
    try {
        const stkCallback = req.body?.Body?.stkCallback;
        if (stkCallback?.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            
            const rawID = String(stkCallback.MerchantRequestID || "");
            const businessShortcode = rawID.includes('-') ? rawID.split('-')[0].trim() : rawID.trim();

            console.log(`🔍 VALIDATING MERCHANT: [${businessShortcode}]`);

            const { data: merchant, error: fetchError } = await supabase
                .from('merchants')
                .select('shortcode, business_name')
                .eq('shortcode', String(businessShortcode))
                .single();

            if (fetchError || !merchant) {
                console.error(`❌ UNAUTHORIZED: Shortcode ${businessShortcode} not found in DB.`);
                return; 
            }

            console.log(`✅ MATCH FOUND: Processing for ${merchant.business_name}`);

            const payload = {
                receipt_number: String(metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value),
                amount: parseFloat(metadata.find(i => i.Name === 'Amount')?.Value),
                phone_number: String(metadata.find(i => i.Name === 'PhoneNumber')?.Value),
                sender_name: String(metadata.find(i => i.Name === 'sender_name')?.Value || "Wycliffe Muka"),
                account: String(metadata.find(i => i.Name === 'BillRefNumber')?.Value || "N/A"), 
                business_shortcode: String(merchant.shortcode),
                transaction_date: new Date().toISOString()
            };

            setTimeout(async () => {
                const { error: insError } = await supabase.from('transactions').insert([payload]);
                
                if (insError) {
                    console.error(`❌ DB REJECTED [${businessShortcode}]:`, insError.message);
                } else {
                    console.log(`🚀 SUCCESS: Transaction saved for ${merchant.business_name}`);
                }
            }, 1000);
        }
    } catch (err) {
        console.error("❌ CALLBACK SYSTEM ERROR:", err.message);
    }
});

const PORT = 10000; 
app.listen(PORT, '0.0.0.0', () => { console.log(`📡 Bridge listening on Port ${PORT}`); });
