const express = require('express');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js'); // New: Link to Supabase
const app = express();

app.use(express.json());

// 1. Connect to your Supabase Project
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_KEY
);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`SautiPesa Bridge Live on Port ${PORT}`));

const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        const data = JSON.parse(msg);
        if (data.type === 'join_room') clients.set(data.userId, ws);
    });
});

// 2. The Daraja Callback Endpoint
app.post('/api/mpesa/callback', async (req, res) => {
    const callbackData = req.body.Body.stkCallback;
    
    if (callbackData.ResultCode === 0) {
        const metadata = callbackData.CallbackMetadata.Item;
        const amount = metadata.find(i => i.Name === 'Amount').Value;
        const receipt = metadata.find(i => i.Name === 'MpesaReceiptNumber').Value;
        const phone = metadata.find(i => i.Name === 'PhoneNumber').Value;

        // --- STEP A: SAVE TO SUPABASE ---
        const { error } = await supabase
            .from('transactions')
            .insert([{ receipt, amount, phone, status: 'SUCCESS' }]);

        if (error) console.error("Supabase Error:", error.message);

        // --- STEP B: NOTIFY ANDROID APP ---
        const targetApp = clients.get("Test_User_001");
        if (targetApp) {
            targetApp.send(JSON.stringify({
                type: 'payment_received',
                amount,
                sender: phone,
                receipt
            }));
        }
    }
    res.status(200).send("Callback Received");
});
