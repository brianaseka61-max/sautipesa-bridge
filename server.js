const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
// Increased limit to 50mb to ensure large inventory/sales syncs never fail
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Universal Bridge is Live and Monitoring!");
});

// --- MERCHANT REGISTRATION ROUTE ---
app.post('/register', async (req, res) => {
    console.log("-----------------------------------------");
    console.log("🏢 ALERT: New Merchant Onboarding Request!");
    const merchantData = req.body;
    if (!merchantData.shortcode) {
        return res.status(400).json({ error: 'Missing business shortcode' });
    }
    try {
        const { error } = await supabase.from('merchants').upsert([merchantData], { onConflict: 'shortcode' });
        if (error) throw error;
        console.log(`✅ SUCCESS: Merchant ${merchantData.business_name} registered.`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error("❌ REGISTRATION ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * UNIVERSAL DYNAMIC SYNC ROUTE
 * This block handles Sugar Sales (sales_history) and Inventory Updates (products)
 * as well as Debts, CRM, Expenses, and Appointments.
 */
app.post('/sync-universal', async (req, res) => {
    const tableName = req.query.table; 
    const dataList = req.body;
    const shortcode = req.query.shortcode || "UNKNOWN";

    console.log("-----------------------------------------");
    console.log(`📡 SYNC START: Table [${tableName}] | Merchant [${shortcode}]`);

    if (!tableName || !Array.isArray(dataList)) {
        console.log("❌ SYNC REJECTED: Invalid data format or missing table name.");
        return res.status(400).json({ error: 'Missing table name or invalid data format' });
    }

    try {
        // Attach the merchant shortcode to each record if it's missing
        const sanitizedData = dataList.map(item => ({
            ...item,
            merchant_shortcode: item.merchant_shortcode || shortcode
        }));

        // Perform the Upsert. This handles both NEW sales and UPDATED product stock (Sugar)
        const { error } = await supabase
            .from(tableName)
            .upsert(sanitizedData, { onConflict: 'id' });

        if (error) {
            console.error(`❌ SUPABASE ERROR [${tableName}]:`, error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ SUCCESS: Synced ${dataList.length} records to ${tableName}.`);
        res.status(200).json({ 
            status: "success", 
            table: tableName, 
            count: dataList.length 
        });
    } catch (err) {
        console.error("❌ SERVER CRITICAL ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- LEGACY SYNC ROUTE ---
app.post('/sync', async (req, res) => {
    console.log("📡 ALERT: Received a Legacy Sales Sync Request.");
    const salesList = req.body;
    try {
        const { error } = await supabase.from('sales_history').upsert(salesList, { onConflict: 'id' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MPESA CALLBACK ROUTE ---
app.post('/callback', async (req, res) => {
    res.status(200).send("Success"); 
    try {
        const stkCallback = req.body?.Body?.stkCallback;
        if (stkCallback?.ResultCode === 0) {
            const metadata = stkCallback.CallbackMetadata.Item;
            const payload = {
                receipt_number: String(metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value),
                amount: parseFloat(metadata.find(i => i.Name === 'Amount')?.Value),
                phone_number: String(metadata.find(i => i.Name === 'PhoneNumber')?.Value),
                transaction_date: new Date().toISOString(),
                merchant_shortcode: req.query.shortcode || "174379" 
            };
            await supabase.from('transactions').insert([payload]);
            console.log("💰 M-Pesa Payment Recorded for:", payload.merchant_shortcode);
        }
    } catch (err) {
        console.error("❌ Callback Error:", err.message);
    }
});

const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`📡 SautiPesa Bridge listening on Port ${PORT}`); 
});
