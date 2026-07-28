const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.json());

// === START ADDED: JSON PARSING CRASH PROTECTION MIDDLEWARE ===
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('❌ JSON Parsing Error: Malformed JSON payload received.');
        return res.status(400).json({ error: 'Invalid JSON format' });
    }
    next();
});
// === END ADDED: JSON PARSING CRASH PROTECTION MIDDLEWARE ===

// Status Check Route
app.get('/', (req, res) => {
    res.status(200).send("🚀 Sauti Pesa Bridge is Active and Running!");
});

// 1. DARAJA VALIDATION URL
// Safaricom hits this FIRST to verify the transaction.
app.post('/api/daraja/validation', (req, res) => {
    console.log("🔍 Safaricom is validating an incoming transaction...");
    // Return ResultCode 0 to tell Safaricom to accept the payment
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// 2. DARAJA CONFIRMATION URL
// Safaricom hits this SECOND with the finalized payment details.
app.post('/api/daraja/confirmation', (req, res) => {
    const paymentData = req.body;
    const tillNumber = paymentData.BusinessShortCode;
    
    // === START ADDED: ROOM STRING TYPE SAFETY VERIFICATION ===
    // Ensures that even if the shortcode arrives as a number, it matches the string room registered by the app
    const targetRoom = tillNumber ? String(tillNumber) : tillNumber;
    // === END ADDED: ROOM STRING TYPE SAFETY VERIFICATION ===
    
    console.log(`💰 Payment received for Till/Paybill: ${tillNumber}`);
    console.log(`💵 Amount: Kes ${paymentData.TransAmount} from ${paymentData.FirstName} ${paymentData.LastName}`);
    
    // Broadcast the transaction via Socket.io to the specific listening phone
    io.to(targetRoom).emit('new_payment', {
        amount: paymentData.TransAmount,
        customerName: `${paymentData.FirstName} ${paymentData.LastName}`,
        time: paymentData.TransTime
    });
    
    // Respond to Safaricom immediately to clear the transaction queue
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// === START ADDED: DYNAMIC MULTI-MERCHANT STK PUSH ENDPOINT ===
app.post('/api/stkpush', async (req, res) => {
    // 1. Extract payment details AND merchant-specific Daraja credentials from the request
    const { 
        phoneNumber, 
        amount, 
        shortCode, 
        consumerKey, 
        consumerSecret, 
        passKey,
        callbackUrl 
    } = req.body;
    
    if (!phoneNumber || !amount || !shortCode) {
        return res.status(400).json({ error: "Phone number, amount, and shortCode are required" });
    }

    // Fallback to default credentials if merchant didn't provide custom keys (for testing)
    const activeKey = consumerKey || "0ydGXEUacH7xLMwMXBZpmOuD9I29S8zzsuWiHGeBK6nBQm8A";
    const activeSecret = consumerSecret || "HGiwyqMhOT52C1lTd78q2khTQ2p6WW6LDmdjrHsJWlbupZNT3CKUleD8NxgumLAk";
    const activePasskey = passKey || "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
    const activeCallback = callbackUrl || "https://your-public-server-domain.com/api/daraja/confirmation";

    console.log(`⚡ Processing dynamic STK Push for Till/Paybill: ${shortCode} -> Phone: ${phoneNumber}, Amount: Kes ${amount}`);

    // 2. Generate strict timestamp (YYYYMMDDHHMMSS)
    const date = new Date();
    const timestamp = date.getFullYear() +
        ("0" + (date.getMonth() + 1)).slice(-2) +
        ("0" + date.getDate()).slice(-2) +
        ("0" + date.getHours()).slice(-2) +
        ("0" + date.getMinutes()).slice(-2) +
        ("0" + date.getSeconds()).slice(-2);

    // 3. Generate password using the merchant's specific shortcode & passkey
    const password = Buffer.from(`${shortCode}${activePasskey}${timestamp}`).toString('base64');

    try {
        // 4. Authenticate with Safaricom using the merchant's specific Consumer Key & Secret
        const auth = Buffer.from(`${activeKey}:${activeSecret}`).toString('base64');
        const tokenResponse = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
            method: 'GET',
            headers: { Authorization: `Basic ${auth}` }
        });
        
        if (!tokenResponse.ok) {
            const errData = await tokenResponse.text();
            console.error("❌ Daraja OAuth Failure:", errData);
            return res.status(401).json({ error: "Failed to authenticate with Daraja using provided merchant credentials" });
        }
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // 5. Format phone number (2547XXXXXXXX)
        const formattedPhone = phoneNumber.startsWith('0') ? `254${phoneNumber.substring(1)}` : phoneNumber.replace('+', '');

        // 6. Build M-Pesa Express payload
        const payload = {
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline", // Use "CustomerBuyGoodsOnline" if targeting Buy Goods Tills
            Amount: amount,
            PartyA: formattedPhone, 
            PartyB: shortCode,
            PhoneNumber: formattedPhone,
            CallBackURL: activeCallback,
            AccountReference: `Till ${shortCode}`,
            TransactionDesc: "Sauti Pesa Payment"
        };

        // 7. Request STK Push trigger
        const pushResponse = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const pushData = await pushResponse.json();

        if (pushData.ResponseCode === "0") {
            console.log(`✅ STK Push successfully triggered for Till ${shortCode}`);
            return res.status(200).json({ 
                success: true, 
                message: "STK Prompt sent to customer phone",
                CheckoutRequestID: pushData.CheckoutRequestID
            });
        } else {
            console.error("❌ Safaricom STK Push Error:", pushData);
            return res.status(400).json({ 
                success: false, 
                error: pushData.ResponseDescription || "Safaricom rejected the payment prompt",
                details: pushData 
            });
        }

    } catch (error) {
        console.error("❌ Server Error during STK Push Execution:", error);
        return res.status(500).json({ error: "Internal Bridge Server Error" });
    }
});
// === END ADDED: DYNAMIC MULTI-MERCHANT STK PUSH ENDPOINT ===

// 3. SOCKET.IO REAL-TIME CONNECTIONS
io.on('connection', (socket) => {
    console.log('📱 Phone connected to socket:', socket.id);
    
    // When the Android app inputs the Till/Paybill, it joins a secure room
    socket.on('register_business', (tillNumber) => {
        // === START ADDED: SANITIZE REGISTRATION DATA ===
        // This guarantees strict isolation. The app ONLY receives data for this specific shortcode.
        const sanitizedTill = tillNumber ? String(tillNumber) : tillNumber;
        socket.join(sanitizedTill);
        // === END ADDED: SANITIZE REGISTRATION DATA ===
        console.log(`✅ Android App is now securely listening for unique Till: ${sanitizedTill}`);
    });
    
    socket.on('disconnect', () => {
        console.log('📱 Phone disconnected from socket');
    });
    // === START ADDED: HEARTBEAT LOOP UPDATE SIGNALS ===
    // Listen for client heartbeats to keep the connection active
    socket.on('client_heartbeat', (data) => {
        console.log(`💓 Client heartbeat received from socket: ${socket.id}`);
        socket.emit('server_heartbeat_ack', { status: 'alive' });
    });
    // Acknowledge server-sent heartbeat
    socket.on('heartbeat_ack', (data) => {
        // Connection is confirmed alive
    });
    // === END ADDED: HEARTBEAT LOOP UPDATE SIGNALS ===
});
// === START ADDED: SERVER HEARTBEAT LOOP ===
// Broadcast a heartbeat ping to all connected clients every 30 seconds
setInterval(() => {
    io.emit('heartbeat', { timestamp: Date.now() });
}, 30000);
// === END ADDED: SERVER HEARTBEAT LOOP ===
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sauti Pesa Bridge LIVE on Port ${PORT}`));
