const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * 🛠️ DATA SANITIZATION ENGINE
 * Matches every table and field from the Sauti Pesa DatabaseHelper.
 */
const sanitizeData = (table, data) => {
    return data.map(item => {
        const cleaned = { ...item };

        // 1. Universal Date Mapping (Standardizing timestamp/created_at)
        const rawDate = cleaned.created_at || cleaned.timestamp || new Date().toISOString();
        cleaned.created_at = rawDate;
        delete cleaned.timestamp;

        // 2. Numeric Cleaning per Table (Prevents "Numeric Syntax" errors)
        const numericFields = [
            'total_amount', 'amount', 'price', 'buying_price', 
            'selling_price', 'stock_level', 'reorder_level', 'quantity', 'balance'
        ];

        numericFields.forEach(field => {
            if (cleaned.hasOwnProperty(field)) {
                if (cleaned[field] === "" || cleaned[field] === null || cleaned[field] === "null") {
                    cleaned[field] = 0;
                } else {
                    cleaned[field] = parseFloat(cleaned[field]) || 0;
                }
            }
        });

        // 3. Table Specific logic for Debt and Inventory
        if (table === 'debts' && !cleaned.status) cleaned.status = 'Unpaid';
        if (table === 'products' && !cleaned.reorder_level) cleaned.reorder_level = 5;

        return cleaned;
    });
};

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Bridge: Fully Synced with DatabaseHelper.");
});

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const cleanedData = sanitizeData(targetTable, data);
        
        // Use the exact table names from your DatabaseHelper
        let supabaseTable = targetTable;
        if (targetTable === 'mpesa_transactions') supabaseTable = 'mpesa_sales';
        if (targetTable === 'debt_history') supabaseTable = 'debts'; // Mapping debt sales to debts table

        const { error } = await supabase
            .from(supabaseTable)
            .upsert(cleanedData, { 
                onConflict: supabaseTable === 'products' ? 'merchant_shortcode,product_name' : 'merchant_shortcode,created_at', 
                ignoreDuplicates: true 
            });

        if (error) {
            console.error(`❌ ERROR in ${supabaseTable}:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ SYNC SUCCESS: ${cleanedData.length} records to ${supabaseTable}`);
        res.status(200).json({ status: "success" });

    } catch (err) {
        console.error("❌ CRITICAL ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/register', async (req, res) => {
    try {
        const { error } = await supabase.from('merchants').upsert([req.body], { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Bridge Active on ${PORT}`));
