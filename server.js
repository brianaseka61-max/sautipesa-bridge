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
            const amountRaw = metadata.find(i => i.Name === 'Amount')?.Value;
            const receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            const phone = metadata.find(i => i.Name === 'PhoneNumber')?.Value;
            const dateRaw = metadata.find(i => i.Name === 'TransactionDate')?.Value;

            // --- NEW: DATE FORMATTING FOR SUPABASE ---
            // Converts 20260225223015 into 2026-02-25T22:30:15
            let formattedDate = new Date().toISOString(); 
            if (dateRaw && String(dateRaw).length >= 14) {
                const s = String(dateRaw);
                formattedDate = `${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}T${s.substring(8,10)}:${s.substring(10,12)}:${s.substring(12,14)}`;
            }

            console.log(`✅ Processing Payment: ${receipt} | Amount: ${amountRaw} | From: ${phone}`);

            // Insert into Supabase 'transactions' table
            const { data, error } = await supabase
                .from('transactions')
                .insert([
                    {
                        receipt_number: receipt,
                        amount: parseFloat(amountRaw), // Ensure it's a number for SQL
                        phone_number: String(phone),
                        transaction_date: formattedDate,
                        checkout_request_id: stkCallback.CheckoutRequestID || '',
                        status: 'completed'
                        // raw_data: req.body // Optional: Remove if your table doesn't have a 'raw_data' column
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`📡 SautiPesa Bridge running on port ${PORT}`);
});
