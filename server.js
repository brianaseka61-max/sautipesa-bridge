const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Status Check Route
app.get('/', (req, res) => {
    res.status(200).send("🚀 Sauti Pesa Bridge is Active!");
});

// 1. DARAJA CONFIRMATION URL
// This is where Safaricom sends the payment data
app.post('/api/daraja/confirmation', (req, res) => {
    const paymentData = req.body;
    const tillNumber = paymentData.BusinessShortCode;

    console.log(`💰 Payment received for Till: ${tillNumber}`);

    // Push the transaction to the specific "room" (the phone listening for this Till)
    io.to(tillNumber).emit('new_payment', {
        amount: paymentData.TransAmount,
        customerName: paymentData.FirstName + " " + paymentData.LastName,
        time: paymentData.TransTime
    });

    // Safaricom requires a 200 OK response immediately
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// 2. SOCKET.IO REAL-TIME LOGIC
io.on('connection', (socket) => {
    console.log('📱 Phone connected:', socket.id);

    // Business registers their Till Number
    socket.on('register_business', (tillNumber) => {
        socket.join(tillNumber);
        console.log(`✅ Business registered for Till: ${tillNumber}`);
    });

    socket.on('disconnect', () => {
        console.log('📱 Phone disconnected');
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sauti Pesa Bridge LIVE on Port ${PORT}`));
