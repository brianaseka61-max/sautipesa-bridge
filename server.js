const express = require('express');
const axios = require('axios');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// 1. Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// 2. Setup WebSocket Server (For Android App)
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 SautiPesa Bridge Live on Port ${PORT}`));
const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on('connection', (ws) => {
    console.log('📱 Android App Connected');
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'join_room') {
            clients.set(data.userId, ws);
            console.log(`👤 User joined: ${data.userId}`);
        }
    });
    ws.on('close', () => console.log('❌ App Disconnected'));
});

// 3. Daraja Access Token Middleware
const getAccessToken = async () => {
    const auth = Buffer.from(`${process.env.DARAJA_CONSUMER_KEY}:${process.env.DARAJA_CONSUMER_SECRET}`).toString('base64');
    try {
        const res = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            headers: { Authorization: `Basic ${auth}` }
        });
        return res.data.access_token;
    } catch (err) {
        console.error("Token Error:", err.response ? err.response.data : err.message);
    }
};

// 4. STK Push Initiation Endpoint
app.post('/api/mpesa/stkpush', async (req, res) => {
    const { phone, amount, userId } = req.body;
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const password = Buffer.from(`${process.env.DARAJA_SHORTCODE}${process.env.DARAJA_PASSKEY}${timestamp}`).toString('base64');

    const requestBody = {
        "BusinessShortCode": process.env.DARAJA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": amount,
        "PartyA": phone,
        "PartyB": process.env.DARAJA_SHORTCODE,
        "PhoneNumber": phone,
        "CallBackURL": "https://sautipesa-bridge.onrender.com/api/mpesa/callback", // Your Render URL
        "AccountReference": userId,
        "TransactionDesc": "Payment for SautiPesa"
    };

    try {
        const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', requestBody, {
            headers: { Authorization: `Bearer ${token}` }
        });
        res.status(200).json(response.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. THE CALLBACK (Handles M-Pesa Response)
app.post('/api/mpesa/callback', async (req, res) => {
    const callbackData = req.body.Body.stkCallback;
    console.log("📥 Callback Received:", JSON.stringify(callbackData));

    if (callbackData.ResultCode === 0) {
        const metadata = callbackData.CallbackMetadata.Item;
        const amount = metadata.find(i => i.Name === 'Amount').Value;
        const receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber').Value;
        const phone = metadata.find(i => i.Name === 'PhoneNumber').Value;
        const userId = req.body.Body.stkCallback.CheckoutRequestID; // Use CheckoutID to find user

        // --- STEP A: SAVE TO SUPABASE ---
        const { error } = await supabase.from('transactions').insert([{ 
            receipt, amount, phone, status: 'SUCCESS' 
        }]);
        if (error) console.error("Supabase Error:", error.message);

        // --- STEP B: PUSH TO ANDROID VIA WEBSOCKET ---
        // We broadcast to all or target specific userId
        wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(JSON.stringify({
                    type: 'payment_received',
                    amount: amount,
                    sender: phone,
                    receipt: receipt
                }));
            }
        });
    }
    res.status(200).send("OK");
});
