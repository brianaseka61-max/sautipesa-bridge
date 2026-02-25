const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// 1. Ensure JSON parsing is active for M-Pesa callbacks
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true }));

// --- LOG ALL INCOMING TRAFFIC (DEBUG MODE) ---
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} request to ${req.url}`);
    next();
});

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Bridge is Live and Waiting!");
});

app.post('/register', async (req, res) => {
    console.log("📝 REGISTRATION DATA:", JSON.stringify(req.body));
    res.status(200).json({ status: "success", message: "Bridge successfully linked" });
});

app.post('/callback', async (req, res) => {
    console.log("💰 CALLBACK RECEIVED:", JSON.stringify(req.body));

    try {
        if (!req.body.Body || !req.body.Body.stkCallback) {
            return res.status(200).send("No Callback Data");
        }

        const stkCallback = req.body.Body.stkCallback;
        
        if (stkCallback.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            const amountRaw = metadata.find(i => i.Name === 'Amount')?.Value;
            const receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            const phone = metadata.find(i => i.Name === 'PhoneNumber')?.Value;
            const dateRaw = metadata.find(i => i.Name === 'TransactionDate')?.Value;

            let formattedDate = new Date().toISOString(); 
            if (dateRaw && String(dateRaw).length >= 14) {
                const s = String(dateRaw);
                formattedDate = `${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}T${s.substring(8,10)}:${s.substring(10,12)}:${s.substring(12,14)}`;
            }

            console.log(`✅ Recording Payment: ${receipt} | Amount: ${amountRaw}`);

            const { error } = await supabase
                .from('transactions')
                .insert([{
                    receipt_number: receipt,
                    amount: parseFloat(amountRaw),
                    phone_number: String(phone),
                    transaction_date: formattedDate,
                    checkout_request_id: stkCallback.CheckoutRequestID || '',
                    status: 'completed'
                }]);

            if (error) console.error("❌ SUPABASE ERROR:", error.message);
            else console.log("🚀 Transaction saved to Supabase.");
        }
        res.status(200).send("Success");
    } catch (err) {
        console.error("❌ PROCESSING ERROR:", err.message);
        res.status(200).send("Error handled");
    }
});

// --- FORCE PORT 10000 FOR RENDER ---
const PORT = 10000; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 SautiPesa Bridge is LIVE and listening on Port ${PORT}`);
});
