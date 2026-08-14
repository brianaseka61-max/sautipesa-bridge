const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// JSON Parsing Crash Protection
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('❌ Malformed JSON payload received.');
        return res.status(400).json({ error: 'Invalid JSON format' });
    }
    next();
});

// Status Check Route
app.get('/', (req, res) => {
    res.status(200).send("🚀 Sauti Pesa Pro Direct-to-Merchant Bridge is Active!");
});

// 1. SAFARICOM DARAJA CALLBACK WEBHOOK
app.post('/api/daraja/confirmation', (req, res) => {
    const paymentData = req.body;
    const targetRoom = req.query.room; 
    
    let amount, customerName, time, phone;
    
    if (paymentData.Body && paymentData.Body.stkCallback) {
        const stkCallback = paymentData.Body.stkCallback;
        
        if (stkCallback.ResultCode !== 0) {
            console.log(`⚠️ STK Push Cancelled/Failed for Merchant ${targetRoom}. Desc: ${stkCallback.ResultDesc}`);
            return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }
        
        const meta = stkCallback.CallbackMetadata?.Item || [];
        amount = meta.find(i => i.Name === 'Amount')?.Value;
        phone = meta.find(i => i.Name === 'PhoneNumber')?.Value;
        time = meta.find(i => i.Name === 'TransactionDate')?.Value;
        customerName = `Phone ${phone}`;
    } else {
        amount = paymentData.TransAmount;
        customerName = `${paymentData.FirstName} ${paymentData.LastName}`;
        time = paymentData.TransTime;
    }
    
    if (targetRoom && amount) {
        console.log(`💰 Direct Payment Verified for Merchant Account: ${targetRoom}`);
        
        // Push the confirmed ledger update directly to the specific Sauti Pesa user's app
        io.to(targetRoom).emit('new_payment', {
            amount: amount,
            customerName: customerName,
            time: time,
            phone: phone
        });
    }
    
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// 2. DYNAMIC INTELLIGENT STK PUSH ROUTER
app.post('/api/daraja/stkpush', async (req, res) => {
    const { 
        consumerKey, 
        consumerSecret, 
        passKey, 
        customerPhoneNumber, 
        amount, 
        merchantDestinationAccount, // This is the Till, Paybill, or 10-digit phone number provided by the Sauti Pesa user
        accountType, // "TILL", "PAYBILL", or "POCHI"
        accountReference // For Paybills, the specific account number. For Tills, defaults to "Till"
    } = req.body;
    
    if (!customerPhoneNumber || !amount || !merchantDestinationAccount) {
        return res.status(400).json({ error: "Missing required fields." });
    }
    
    const formattedCustomerPhone = String(customerPhoneNumber).startsWith('0') ? `254${String(customerPhoneNumber).substring(1)}` : String(customerPhoneNumber).replace('+', '');
    const destinationStr = String(merchantDestinationAccount);
    
    // --- BYPASS: POCHI LA BIASHARA / SEND MONEY ---
    if (accountType === "POCHI" || destinationStr.length >= 9) {
        console.log(`⚠️ Safaricom blocks STK pushes to 10-digit personal/Pochi numbers (${destinationStr}).`);
        
        // Immediately ping the Sauti Pesa Android app so it knows the push cannot be sent via Daraja
        io.to(destinationStr).emit('direct_stk_prompt', {
            amount: amount,
            phoneNumber: formattedCustomerPhone,
            type: "POCHI_OR_SEND_MONEY",
            status: "BLOCKED_BY_SAFARICOM_FALLBACK_REQUIRED"
        });
        
        return res.status(200).json({ 
            success: true, 
            fallbackActive: true,
            message: "Target is a 10-digit number. Safaricom API physically bypassed.",
            actionRequired: "Sauti Pesa app must handle UX locally on device."
        });
    }
    
    // --- EXECUTION: TILL OR PAYBILL DARAJA PUSH ---
    if (!consumerKey || !consumerSecret || !passKey) {
        return res.status(400).json({ error: "Merchant's Live Daraja Credentials are required to execute Till/Paybill push." });
    }
    
    try {
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
        const tokenResponse = await fetch("https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
            method: 'GET',
            headers: { Authorization: `Basic ${auth}` }
        });
        
        if (!tokenResponse.ok) {
            return res.status(401).json({ error: "Invalid Merchant Credentials." });
        }
        
        const { access_token } = await tokenResponse.json();
        const date = new Date();
        const timestamp = date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours()).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2);
            
        // Dynamically assign Daraja transaction type based on Sauti Pesa user's registered account
        const transactionType = accountType === "TILL" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";
        const password = Buffer.from(`${destinationStr}${passKey}${timestamp}`).toString('base64');
        
        // IMPORTANT: Replace 'your-public-server-domain.com' with your actual hosted Render URL
        const callbackUrl = `https://your-public-server-domain.com/api/daraja/confirmation?room=${destinationStr}`;
        
        const payload = {
            BusinessShortCode: destinationStr, 
            Password: password,
            Timestamp: timestamp,
            TransactionType: transactionType,
            Amount: Math.round(Number(amount)), 
            PartyA: formattedCustomerPhone, 
            PartyB: destinationStr, 
            PhoneNumber: formattedCustomerPhone,
            CallBackURL: callbackUrl,
            AccountReference: accountReference || `Payment`, 
            TransactionDesc: "Sauti Pesa Payment"
        };
        
        const pushResponse = await fetch("https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
            method: 'POST',
            headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const pushData = await pushResponse.json();
        
        if (pushData.ResponseCode === "0") {
            console.log(`✅ Push seamlessly executed for Merchant Account ${destinationStr}`);
            
            // Notify merchant app that the prompt successfully reached the customer
            io.to(destinationStr).emit('direct_stk_prompt', {
                amount: Math.round(Number(amount)),
                phoneNumber: formattedCustomerPhone,
                type: "DARAJA_STK_PUSH",
                status: "PROMPT_SENT_TO_CUSTOMER"
            });
            
            return res.status(200).json({ success: true, message: "Direct Push Sent", CheckoutRequestID: pushData.CheckoutRequestID });
        } else {
            console.error("❌ Safaricom STK Push Error:", pushData);
            return res.status(400).json({ error: "Safaricom rejected the request", details: pushData });
        }
    } catch (error) {
        console.error("❌ Bridge Error:", error);
        return res.status(500).json({ error: "Internal Bridge Error", details: error.message });
    }
});

// 3. SOCKET.IO SAUTI PESA APP CONNECTIONS
io.on('connection', (socket) => {
    console.log('📱 Android Device connected to socket:', socket.id);
    
    // Sauti Pesa app connects and listens for its specific Till, Paybill, or Phone Number
    socket.on('register_business', (merchantDestinationAccount) => {
        const sanitizedRoom = String(merchantDestinationAccount);
        socket.join(sanitizedRoom);
        console.log(`✅ Sauti Pesa Pro tracking ledger for Account: ${sanitizedRoom}`);
    });
    
    socket.on('disconnect', () => {
        console.log('📱 Device disconnected');
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sauti Pesa Bridge LIVE on Port ${PORT}`));
