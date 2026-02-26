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

app.post('/callback', async (req, res) => {
    console.log("💰 CALLBACK RECEIVED:", JSON.stringify(req.body));

    try {
        const stkCallback = req.body?.Body?.stkCallback;
        if (stkCallback?.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            
            // Extract the Receipt and the Shortcode (Business ID)
            let originalReceipt = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
            const testReceipt = originalReceipt + "_" + Math.floor(Math.random() * 10000);
            
            // This pulls the Paybill/Till number from the metadata to identify the business
            const businessShortcode = req.body.Body.stkCallback.MerchantRequestID.split('-')[0] || "UNKNOWN";

            const payload = {
                receipt_number: testReceipt, 
                amount: parseFloat(metadata.find(i => i.Name === 'Amount')?.Value),
                phone_number: String(metadata.find(i => i.Name === 'PhoneNumber')?.Value),
                sender_name: String(metadata.find(i => i.Name === 'sender_name')?.Value || ""),
                account: String(metadata.find(i => i.Name === 'BillRefNumber')?.Value || "N/A"), 
                business_shortcode: businessShortcode, // THE KEY FOR PRIVACY
                transaction_date: new Date().toISOString()
            };

            const { error } = await supabase.from('transactions').insert([payload]);

            if (!error) console.log(`🚀 SUCCESS: Saved for Business ${businessShortcode}`);
        }
        res.status(200).send("Success");
    } catch (err) {
        res.status(200).send("Error Handled");
    }
});

const PORT = 10000; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Bridge listening on Port ${PORT}`);
});
