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

// 2. Setup WebSocket Server with Room Logic
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 SautiPesa Multi-Tenant Bridge Live on Port ${PORT}`));
const wss = new WebSocketServer({ server });

// Store clients by their shortcode (for unique room routing)
const rooms = new Map(); // Key: shortcode, Value: Set of WebSocket clients

wss.on('connection', (ws) => {
    console.log('📱 New App Connection Attempted');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'join_room') {
                const shortcode = data.shortcode; // The business shortcode
                ws.shortcode = shortcode;
                
                if (!rooms.has(shortcode)) {
                    rooms.set(shortcode, new Set());
                }
                rooms.get(shortcode).add(ws);
                console.log(`👤 Business joined room: ${shortcode}`);
            }
        } catch (e) {
            console.error("WS Message Error:", e.message);
        }
    });

    ws.on('close', () => {
        if (ws.shortcode && rooms.has(ws.shortcode)) {
            rooms.get(ws.shortcode).delete(ws);
            console.log(`❌ Business ${ws.shortcode} disconnected`);
        }
    });
});

// 3. Dynamic Daraja Access Token Function
// This fetches credentials from Supabase based on the shortcode
const getBusinessAccessToken = async (shortcode) => {
    const { data: biz, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('shortcode', shortcode)
        .single();

    if (error || !biz) throw new Error("Business credentials not found");

    const auth = Buffer.from(`${biz.consumer_key}:${biz.consumer_secret}`).toString('base64');
    const res = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
        headers: { Authorization: `Basic ${auth}` }
    });
    return { token: res.data.access_token, passkey: biz.passkey };
};

// 4. Multi-Tenant STK Push Initiation
app.post('/api/mpesa/stkpush', async (req, res) => {
    const { phone, amount, shortcode } = req.body;

    try {
        const { token, passkey } = await getBusinessAccessToken(shortcode);
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

        const requestBody = {
            "BusinessShortCode": shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline", // Change to CustomerBuyGoodsOnline for Till
            "Amount": amount,
            "PartyA": phone,
            "PartyB": shortcode,
            "PhoneNumber": phone,
            "CallBackURL": `https://sautipesa-bridge.onrender.com/api/mpesa/callback/${shortcode}`,
            "AccountReference": "SautiPesa",
            "TransactionDesc": "Business Payment"
        };

        const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', requestBody, {
            headers: { Authorization: `Bearer ${token}` }
        });
        res.status(200).json(response.data);
    } catch (err) {
        console.error("STK Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 5. THE DYNAMIC CALLBACK (Handles unique rooms and dynamic businesses)
app.post('/api/mpesa/callback/:shortcode', async (req, res) => {
    const { shortcode } = req.params;
    const callbackData = req.body.Body.stkCallback;
    console.log(`📥 Callback for ${shortcode}:`, JSON.stringify(callbackData));

    if (callbackData.ResultCode === 0) {
        const metadata = callbackData.CallbackMetadata.Item;
        const amount = metadata.find(i => i.Name === 'Amount').Value;
        const receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber').Value;
        const phone = metadata.find(i => i.Name === 'PhoneNumber').Value;

        // Save to Supabase transactions table
        const { error } = await supabase.from('transactions').insert([{ 
            business_shortcode: shortcode,
            receipt, 
            amount, 
            phone, 
            status: 'SUCCESS' 
        }]);
        if (error) console.error("DB Error:", error.message);

        // Broadcast ONLY to the business room
        if (rooms.has(shortcode)) {
            const notification = JSON.stringify({
                type: 'payment_received',
                amount,
                phone,
                receipt,
                message: `Confirmed. You have received KES ${amount} from ${phone}.`
            });
            
            rooms.get(shortcode).forEach(client => {
                if (client.readyState === 1) client.send(notification);
            });
        }
    }
    res.status(200).send("OK");
});
