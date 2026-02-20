const express = require('express');
const axios = require('axios');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- DEBUGGING MIDDLEWARE ---
// This logs every request to your Render logs so you can see if the app hits the wrong URL
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 1. Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// --- ROOT ROUTE (To test if the server is live in a browser) ---
app.get('/', (req, res) => {
    res.status(200).send('🚀 Sauti Pesa Bridge is Online and Ready!');
});

// --- HEALTH CHECK ENDPOINT ---
app.get('/health', (req, res) => {
    res.status(200).send('Sauti Pesa Bridge is Awake');
});

// --- POLLING ENDPOINT ---
app.get('/api/mpesa/check-payments/:shortcode', async (req, res) => {
    const { shortcode } = req.params;
    try {
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        
        const { data, error } = await supabase
            .from('transactions')
            .select('amount, phone, receipt')
            .eq('business_shortcode', shortcode)
            .eq('status', 'SUCCESS')
            .gt('created_at', oneMinuteAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(); // Use maybeSingle to avoid 406 errors if empty

        if (error || !data) {
            return res.status(204).end(); 
        }

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: "Polling failed" });
    }
});

// --- BUSINESS REGISTRATION ENDPOINT (Fixed for OnboardingActivity) ---
app.post('/api/business/register', async (req, res) => {
    const { business_name, shortcode, consumer_key, consumer_secret, passkey } = req.body;
    console.log(`📝 Attempting registration for: ${shortcode}`);

    try {
        const { data, error } = await supabase
            .from('businesses')
            .upsert({ 
                business_name, 
                shortcode, 
                consumer_key, 
                consumer_secret, 
                passkey,
                updated_at: new Date() 
            }, { onConflict: 'shortcode' });

        if (error) throw error;

        console.log(`✅ Registration Successful: ${business_name}`);
        res.status(201).json({ status: "success", message: "Registration Successful", shortcode });
    } catch (err) {
        console.error("❌ Registration Error:", err.message);
        res.status(500).json({ status: "error", error: err.message });
    }
});

// 2. Setup WebSocket Server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 SautiPesa Bridge Live on Port ${PORT}`));
const wss = new WebSocketServer({ server });

const rooms = new Map(); 

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'join_room') {
                const shortcode = data.shortcode; 
                ws.shortcode = shortcode;
                if (!rooms.has(shortcode)) rooms.set(shortcode, new Set());
                rooms.get(shortcode).add(ws);
            }
        } catch (e) {
            console.error("WS Error:", e.message);
        }
    });

    ws.on('close', () => {
        if (ws.shortcode && rooms.has(ws.shortcode)) {
            rooms.get(ws.shortcode).delete(ws);
            if (rooms.get(ws.shortcode).size === 0) rooms.delete(ws.shortcode);
        }
    });
});

// 3. Helper: Generate Access Token
const getBusinessCredentials = async (shortcode) => {
    const { data: biz, error } = await supabase
        .from('businesses')
        .select('consumer_key, consumer_secret, passkey')
        .eq('shortcode', shortcode)
        .single();

    if (error || !biz) throw new Error(`Credentials not found for ${shortcode}`);

    const auth = Buffer.from(`${biz.consumer_key}:${biz.consumer_secret}`).toString('base64');
    const res = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
        headers: { Authorization: `Basic ${auth}` }
    });
    
    return { token: res.data.access_token, passkey: biz.passkey };
};

// 4. STK Push Initiation
app.post('/api/mpesa/stkpush', async (req, res) => {
    const { phone, amount, shortcode } = req.body;
    try {
        const { token, passkey } = await getBusinessCredentials(shortcode);
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

        const requestBody = {
            "BusinessShortCode": shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline", 
            "Amount": amount,
            "PartyA": phone,
            "PartyB": shortcode,
            "PhoneNumber": phone,
            "CallBackURL": `https://sautipesa-bridge.onrender.com/api/mpesa/callback/${shortcode}`,
            "AccountReference": "SautiPesa",
            "TransactionDesc": `Payment`
        };

        const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', requestBody, {
            headers: { Authorization: `Bearer ${token}` }
        });
        res.status(200).json(response.data);
    } catch (err) {
        res.status(500).json({ error: "STK Push Failed" });
    }
});

// 5. CALLBACK
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
            receipt, amount, phone, status: 'SUCCESS' 
        }]);

        if (rooms.has(shortcode)) {
            const msg = JSON.stringify({ type: 'payment_received', data: { amount, phone, receipt } });
            rooms.get(shortcode).forEach(client => {
                if (client.readyState === 1) client.send(msg);
            });
        }
    }
    res.status(200).send("OK");
});

// --- CATCH-ALL 404 HANDLER ---
// If the app hits a URL not defined above, this will log it
app.use((req, res) => {
    console.warn(`⚠️ 404 Alert: App tried to reach non-existent route: ${req.url}`);
    res.status(404).json({ error: "Route not found. Check your Android code URL." });
});
