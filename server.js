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
app.post('/api/daraja/validation', (req, res) => {
    console.log("🔍 Safaricom is validating an incoming transaction...");
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// 2. DARAJA CONFIRMATION URL
app.post('/api/daraja/confirmation', (req, res) => {
    const paymentData = req.body;
    const tillNumber = req.query.room || paymentData.BusinessShortCode;
    let amount, customerName, time;
    
    // Handle STK Push Webhook Payload vs C2B Payload
    if (paymentData.Body && paymentData.Body.stkCallback) {
        const stkCallback = paymentData.Body.stkCallback;
        
        if (stkCallback.ResultCode !== 0) {
            console.log(`⚠️ STK Push Failed/Cancelled by User. Desc: ${stkCallback.ResultDesc}`);
            return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
        
        const meta = stkCallback.CallbackMetadata?.Item || [];
        amount = meta.find(i => i.Name === 'Amount')?.Value;
        const phone = meta.find(i => i.Name === 'PhoneNumber')?.Value;
        time = meta.find(i => i.Name === 'TransactionDate')?.Value;
        customerName = `Phone ${phone}`;
    } else {
        amount = paymentData.TransAmount;
        customerName = `${paymentData.FirstName} ${paymentData.LastName}`;
        time = paymentData.TransTime;
    }
    
    const targetRoom = tillNumber ? String(tillNumber) : null;
    
    if (targetRoom && amount) {
        console.log(`💰 Payment received for Unique Merchant Room: ${targetRoom}`);
        console.log(`💵 Amount: Kes ${amount} from ${customerName}`);
        
        io.to(targetRoom).emit('new_payment', {
            amount: amount,
            customerName: customerName,
            time: time
        });
    }
    
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// === START ADDED: DYNAMIC MULTI-MERCHANT STK PUSH ENDPOINT ===
app.all(/^\/.*stk.*/i, async (req, res) => {
    const payloadSource = Object.keys(req.body).length > 0 ? req.body : req.query;
    
    const consumerKey = payloadSource.consumerKey;
    const consumerSecret = payloadSource.consumerSecret;
    const passKey = payloadSource.passKey;
    const callbackUrl = payloadSource.callbackUrl;
    
    const phoneNumber = payloadSource.phoneNumber || payloadSource.phone;
    const amount = payloadSource.amount;
    
    // Extract exact customer registered account reference details and description
    const shortCode = payloadSource.shortCode || payloadSource.tillNumber || payloadSource.merchantDestinationAccount;
    const accountType = payloadSource.accountType || ""; // Expected: "TILL", "PAYBILL", or "POCHI"
    const accountReference = payloadSource.accountReference || `Till ${shortCode}`;
    const transactionDesc = payloadSource.transactionDesc || "Sauti Pesa Payment";
    
    if (!phoneNumber || !amount || !shortCode) {
        return res.status(400).json({ error: "Phone number, amount, and shortCode are required" });
    }

    const formattedPhone = String(phoneNumber).startsWith('0') ? `254${String(phoneNumber).substring(1)}` : String(phoneNumber).replace('+', '');
    const targetAccountStr = String(shortCode);

    // ====================================================================
    // INTELLIGENT ROUTER STEP 1: POCHI LA BIASHARA / SEND MONEY BYPASS
    // ====================================================================
    const isPersonalPhoneNumber = targetAccountStr.length >= 9 || accountType.toUpperCase() === "POCHI";

    if (isPersonalPhoneNumber) {
        console.log(`⚠️ Send Money/Pochi detected for account (${targetAccountStr}). Safaricom blocks STK pushes to personal numbers.`);
        console.log("🔄 Bypassing Safaricom Daraja API to prevent 400 error. Relying exclusively on Sauti Pesa Socket delivery...");
        
        // Immediately ping the Sauti Pesa Android app so it knows to handle the UX locally
        io.to(targetAccountStr).emit('direct_stk_prompt', {
            amount: Math.round(Number(amount)),
            phoneNumber: formattedPhone,
            shortCode: targetAccountStr,
            accountType: accountType || "POCHI_OR_SEND_MONEY",
            status: "BLOCKED_BY_SAFARICOM_FALLBACK_REQUIRED",
            accountReference: accountReference,
            transactionDesc: transactionDesc
        });
        
        return res.status(200).json({ 
            success: true, 
            fallbackActive: true,
            message: "Target is a personal phone number or Pochi. Safaricom API physically bypassed.",
            accountDetails: {
                shortCode: targetAccountStr,
                accountReference: accountReference,
                amount: amount,
                phoneNumber: formattedPhone
            },
            actionRequired: "Sauti Pesa app must handle UX locally on device."
        });
    }

    // ====================================================================
    // INTELLIGENT ROUTER STEP 2: TILL & PAYBILL DARAJA EXECUTION
    // ====================================================================
    
    // IMPORTANT: REPLACE THESE WITH LIVE PRODUCTION CREDENTIALS TO TRIGGER REAL PUSHES
    const activeKey = consumerKey || "0ydGXEUacH7xLMwMXBZpmOuD9I29S8zzsuWiHGeBK6nBQm8A";
    const activeSecret = consumerSecret || "HGiwyqMhOT52C1lTd78q2khTQ2p6WW6LDmdjrHsJWlbupZNT3CKUleD8NxgumLAk";
    const activePasskey = passKey || "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
    const activeCallback = callbackUrl || "https://your-public-server-domain.com/api/daraja/confirmation";
    console.log(`⚡ Processing dynamic STK Push for Unique Merchant Till/Paybill: ${targetAccountStr} -> Phone: ${formattedPhone}, Amount: Kes ${amount}`);
    
    const date = new Date();
    const timestamp = date.getFullYear() +
        ("0" + (date.getMonth() + 1)).slice(-2) +
        ("0" + date.getDate()).slice(-2) +
        ("0" + date.getHours()).slice(-2) +
        ("0" + date.getMinutes()).slice(-2) +
        ("0" + date.getSeconds()).slice(-2);
        
    try {
        const auth = Buffer.from(`${activeKey}:${activeSecret}`).toString('base64');
        
        let darajaEnvironmentUrl = "https://api.safaricom.co.ke";
        let isSandbox = false;
        
        let tokenResponse = await fetch(`${darajaEnvironmentUrl}/oauth/v1/generate?grant_type=client_credentials`, {
            method: 'GET',
            headers: { Authorization: `Basic ${auth}` }
        });
        
        // If Production authentication fails, fallback to Sandbox strictly for test keys
        if (!tokenResponse.ok) {
            console.log("⚠️ Production Auth failed (Sandbox keys detected). Routing to Sandbox environment...");
            darajaEnvironmentUrl = "https://sandbox.safaricom.co.ke";
            isSandbox = true;
            
            tokenResponse = await fetch(`${darajaEnvironmentUrl}/oauth/v1/generate?grant_type=client_credentials`, {
                method: 'GET',
                headers: { Authorization: `Basic ${auth}` }
            });
        }
        
        if (!tokenResponse.ok) {
            const errData = await tokenResponse.text();
            console.error("❌ Daraja OAuth Failure:", errData);
            return res.status(401).json({ error: "Failed to authenticate with Daraja. Ensure keys are valid.", details: errData });
        }
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        let pushShortCode = targetAccountStr;
        let pushPasskey = passKey || activePasskey;

        // Safaricom Sandbox strictly rejects custom shortcodes. 
        // If testing in sandbox, we must map to the test shortcode to prevent a crash.
        // If live production keys are detected, the real merchant shortcode is preserved.
        if (isSandbox && String(targetAccountStr) !== "174379") {
            console.log("⚠️ Sandbox limits detected. Safaricom simulator requires test shortcode 174379 to process payloads.");
            pushShortCode = "174379"; 
            pushPasskey = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"; 
        }

        // Dynamically choose transaction type based on Sauti Pesa user's accountType or structural context
        const isBuyGoods = accountType.toUpperCase() === "TILL" || String(pushShortCode).length === 7 || payloadSource.transactionType === 'CustomerBuyGoodsOnline';
        const transactionType = isBuyGoods ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

        const password = Buffer.from(`${pushShortCode}${pushPasskey}${timestamp}`).toString('base64');
        const callbackWithRoom = `${activeCallback}?room=${targetAccountStr}`;
        
        // Emit direct to device socket first, preserving the original merchant routing regardless of Daraja sandbox overrides
        io.to(targetAccountStr).emit('direct_stk_prompt', {
            amount: Math.round(Number(amount)),
            phoneNumber: formattedPhone,
            shortCode: targetAccountStr,
            accountType: accountType || (isBuyGoods ? "TILL" : "PAYBILL"),
            status: "DARAJA_PROMPT_SENT",
            accountReference: accountReference,
            transactionDesc: transactionDesc
        });
        console.log(`📲 Direct prompt notification pushed via Socket.io to merchant room: ${targetAccountStr}`);

        const payload = {
            BusinessShortCode: pushShortCode, 
            Password: password,
            Timestamp: timestamp,
            TransactionType: transactionType,
            Amount: Math.round(Number(amount)), 
            PartyA: formattedPhone, 
            PartyB: pushShortCode, 
            PhoneNumber: formattedPhone,
            CallBackURL: callbackWithRoom,
            AccountReference: isBuyGoods ? (accountReference || `Till ${targetAccountStr}`) : accountReference, 
            TransactionDesc: transactionDesc 
        };
        
        const pushResponse = await fetch(`${darajaEnvironmentUrl}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const pushData = await pushResponse.json();
        
        if (pushData.ResponseCode === "0") {
            console.log(`✅ STK Push successfully triggered via Safaricom for targeted account ${pushShortCode}`);
            return res.status(200).json({ 
                success: true, 
                message: "STK Prompt sent directly to customer and socket",
                CheckoutRequestID: pushData.CheckoutRequestID
            });
        } else {
            console.error("❌ Safaricom STK Push Error (400 Bad Request prevention failed at Daraja level):", pushData);
            
            console.log("⚠️ Safaricom API rejected payload, but direct socket push was delivered to merchant account.");
            
            return res.status(200).json({ 
                success: true, 
                fallbackActive: true,
                message: "Prompt routed exclusively via unique merchant socket connection due to Daraja rejection",
                accountDetails: {
                    shortCode: targetAccountStr,
                    accountReference: accountReference,
                    amount: amount,
                    phoneNumber: formattedPhone
                },
                darajaError: pushData.errorMessage || pushData.ResponseDescription || "Custom Account Routing Active"
            });
        }
    } catch (error) {
        console.error("❌ Server Error during STK Push Execution:", error);
        return res.status(500).json({ error: "Internal Bridge Server Error", details: error.message });
    }
});
// === END ADDED: DYNAMIC MULTI-MERCHANT STK PUSH ENDPOINT ===

// 3. SOCKET.IO REAL-TIME CONNECTIONS
io.on('connection', (socket) => {
    console.log('📱 Phone connected to socket:', socket.id);
    
    socket.on('register_business', (tillNumber) => {
        const sanitizedTill = tillNumber ? String(tillNumber) : tillNumber;
        socket.join(sanitizedTill);
        console.log(`✅ Android App registered to listen for unique Merchant Room: ${sanitizedTill}`);
    });
    
    socket.on('disconnect', () => {
        console.log('📱 Phone disconnected from socket');
    });
    
    socket.on('client_heartbeat', (data) => {
        socket.emit('server_heartbeat_ack', { status: 'alive' });
    });
    
    socket.on('heartbeat_ack', (data) => {});
});

setInterval(() => {
    io.emit('heartbeat', { timestamp: Date.now() });
}, 30000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sauti Pesa Bridge LIVE on Port ${PORT}`));
