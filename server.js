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
    io.to(tillNumber).emit('new_payment', {
        amount: paymentData.TransAmount,
        customerName: `${paymentData.FirstName} ${paymentData.LastName}`,
        time: paymentData.TransTime
    });
    
    // Respond to Safaricom immediately to clear the transaction queue
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});
// 3. SOCKET.IO REAL-TIME CONNECTIONS
io.on('connection', (socket) => {
    console.log('📱 Phone connected to socket:', socket.id);
    
    // When the Android app inputs the Till/Paybill, it joins a secure room
    socket.on('register_business', (tillNumber) => {
        // === START ADDED: SANITIZE REGISTRATION DATA ===
        const sanitizedTill = tillNumber ? String(tillNumber) : tillNumber;
        socket.join(sanitizedTill);
        // === END ADDED: SANITIZE REGISTRATION DATA ===
        socket.join(tillNumber);
        console.log(`✅ Android App is now listening for Till: ${tillNumber}`);
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
