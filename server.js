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
            
            // Get the receipt from ReqBin
            let originalReceipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            
            // ADDED: Random suffix so you never get a "Duplicate Key" error again during testing
            const testReceipt = originalReceipt + "_" + Math.floor(Math.random() * 10000);

            // EXTRACT ACCOUNT: M-Pesa sends this as 'BillRefNumber'
            const accountValue = metadata.find(i => i.Name === 'BillRefNumber')?.Value || "N/A";

            // NEW: EXTRACT SENDER NAME (Prioritize 'sender_name' or 'ExternalReference' from testing tools)
            const nameValue = metadata.find(i => i.Name === 'sender_name')?.Value || 
                              metadata.find(i => i.Name === 'ExternalReference')?.Value || "";

            const payload = {
                receipt_number: testReceipt, 
                amount: parseFloat(metadata.find(i => i.Name === 'Amount')?.Value),
                phone_number: String(metadata.find(i => i.Name === 'PhoneNumber')?.Value),
                sender_name: String(nameValue), // This ensures the name is sent to Supabase
                account: String(accountValue), 
                transaction_date: new Date().toISOString()
            };

            console.log(`✅ Attempting Unique Save: Receipt=${payload.receipt_number}, Name=${payload.sender_name}, Account=${payload.account}`);

            const { error } = await supabase.from('transactions').insert([payload]);

            if (error) {
                console.error("❌ SUPABASE ERROR:", error.message);
            } else {
                console.log(`🚀 SUCCESS: Saved ${payload.receipt_number} for ${payload.sender_name} to Supabase!`);
            }
        }
        res.status(200).send("Success");
    } catch (err) {
        console.error("❌ PROCESSING ERROR:", err.message);
        res.status(200).send("Error Handled");
    }
});

const PORT = 10000; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Bridge listening on Port ${PORT}`);
});
