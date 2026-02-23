const express = require('express');
const axios = require('axios');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// 1. Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// --- ROOT ROUTE (Checks if server is alive) ---
app.get('/', (req, res) => {
    res.status(200).send('🚀 Sauti Pesa Bridge is Online!');
});

// --- BUSINESS REGISTRATION ---
app.post('/api/business/register', async (req, res) => {
    const { business_name = "New Business", shortcode, consumer_key, consumer_secret, passkey } = req.body;
    try {
        const { data, error } = await supabase
            .from('businesses')
            .upsert({ business_name, shortcode, consumer_key, consumer_secret, passkey }, { onConflict: 'shortcode' });

        if (error) throw error;
        res.status(201).json({ status: "success", shortcode });
    } catch (err) {
        res.status(500).json({ status: "error", details: err.message });
    }
});

// --- MPESA CALLBACK ---
app.post('/api/mpesa/callback/:shortcode', async (req, res) => {
    const { shortcode } = req.params;
    const callbackData = req.body.Body.stkCallback;

    if (callbackData.ResultCode === 0) {
        const metadata = callbackData.CallbackMetadata.Item;
        const amount = metadata.find(i => i.Name === 'Amount').Value;
        const receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber').Value;
        const phone = metadata.find(i => i.Name === 'PhoneNumber').Value;

        await supabase.from('transactions').insert([{ 
            business_shortcode: shortcode, 
            receipt, 
            amount: amount.toString(), 
            phone: phone.toString(), 
            status: 'SUCCESS' 
        }]);
    }
    res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
