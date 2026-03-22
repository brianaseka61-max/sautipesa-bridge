const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
// High limit (50mb) to handle large bulk inventory or sync history
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Omni-Bridge: Monitoring All Business Activities!");
});

/**
 * 🛠️ UNIVERSAL OMNI-ROUTING & MAPPING
 * This single route catches everything from the app and sorts it into Supabase.
 */
app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = req.body;
    
    // Ensure data is always an array for Supabase bulk upsert
    if (!Array.isArray(data)) {
        data = [data];
    }

    console.log("-----------------------------------------");
    console.log(`📡 OMNI-SYNC START: [${targetTable}]`);
    console.log(`📦 Processing ${data.length} records...`);

    try {
        /**
         * 🗺️ MASTER TABLE MAPPING
         * Maps Android Activity routes to your specific Supabase Schema names.
         */
        let supabaseTable = targetTable;

        switch (targetTable) {
            case 'mpesa_transactions': 
                supabaseTable = 'mpesa_sales'; 
                break;
            case 'sales_history': 
                supabaseTable = 'sales_history'; // Cash Sales
                break;
            case 'products': 
                supabaseTable = 'products'; // Inventory items & stock levels
                break;
            case 'debts': 
                supabaseTable = 'debts'; // Debt additions & status
                break;
            case 'debt_history': 
                supabaseTable = 'debt_payments'; // Payments against debts
                break;
            case 'expenses': 
                supabaseTable = 'expenses'; 
                break;
            case 'appointments': 
            case 'crm_appointments': // ADDED: Map CRM data to appointments table
                supabaseTable = 'appointments'; 
                break;
            case 'customers': // ADDED: Map customer profiles
                supabaseTable = 'customers';
                break;
            default:
                // If no mapping exists, attempt to use the targetTable name directly
                supabaseTable = targetTable;
        }

        // Perform the Upsert. This handles NEW entries and UPDATES existing ones (like stock).
        const { error } = await supabase
            .from(supabaseTable)
            .upsert(data, { 
                onConflict: 'id', // Uses the local ID to prevent duplicates in Supabase
                ignoreDuplicates: false 
            });

        if (error) {
            console.error(`❌ SUPABASE ERROR [${supabaseTable}]:`, error.message);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ SUCCESS: Synced ${data.length} records to ${supabaseTable}.`);
        res.status(200).json({ status: "success", table: supabaseTable, count: data.length });

    } catch (err) {
        console.error("❌ BRIDGE CRITICAL ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- MERCHANT REGISTRATION ---
app.post('/register', async (req, res) => {
    const merchantData = req.body;
    try {
        const { error } = await supabase.from('merchants').upsert([merchantData], { onConflict: 'shortcode' });
        if (error) throw error;
        console.log(`🏢 Merchant Registered: ${merchantData.business_name}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error("❌ REGISTRATION ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- MPESA CALLBACK (STK PUSH) ---
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
            console.log("💰 M-Pesa Payment Logged Successfully.");
        }
    } catch (err) {
        console.error("❌ CALLBACK ERROR:", err.message);
    }
});

const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`📡 SautiPesa Omni-Bridge listening on Port ${PORT}`); 
});
