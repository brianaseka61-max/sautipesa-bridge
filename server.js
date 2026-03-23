const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * 🛡️ THE PERMANENT STABILITY FIX
 * This function cleans every record to ensure it matches Supabase's strict SQL types.
 */
const cleanRecordForPostgres = (item) => {
    const cleaned = { ...item };

    // 1. Fix Date: Standardize 'timestamp' or 'created_at' to ISO format
    let rawDate = cleaned.timestamp || cleaned.created_at || new Date().toISOString();
    if (rawDate.includes('/')) {
        try {
            const [datePart, timePart] = rawDate.split(' ');
            const [d, m, y] = datePart.split('/');
            const year = y.length === 2 ? `20${y}` : y;
            cleaned.created_at = `${year}-${m}-${d}T${timePart || '00:00'}:00Z`;
        } catch (e) {
            cleaned.created_at = new Date().toISOString();
        }
    } else {
        cleaned.created_at = rawDate;
    }
    // Remove 'timestamp' to avoid "column does not exist" errors in Supabase
    delete cleaned.timestamp;

    // 2. Fix Numeric Syntax: The "Sure Fix" for the Red Errors in your logs
    // This list covers all your business tables (Sales, Products, Debts, Expenses)
    const numericColumns = [
        'total_amount', 'amount', 'price', 'buying_price', 
        'selling_price', 'stock_level', 'quantity', 'balance', 'amount_paid'
    ];

    numericColumns.forEach(col => {
        if (cleaned.hasOwnProperty(col)) {
            // If the value is an empty string "", "null", or undefined, set it to 0
            if (cleaned[col] === "" || cleaned[col] === null || cleaned[col] === undefined || cleaned[col] === "null") {
                cleaned[col] = 0;
            } else {
                // Ensure it's a real number, not a string representation of a number
                const parsed = parseFloat(cleaned[col]);
                cleaned[col] = isNaN(parsed) ? 0 : parsed;
            }
        }
    });

    return cleaned;
};

app.get('/', (req, res) => {
    res.status(200).send("🚀 SautiPesa Bridge: Data Cleaning Active & Stable");
});

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = req.body;
    if (!Array.isArray(data)) data = [data];

    console.log(`📡 Processing Sync: ${targetTable} (${data.length} records)`);

    try {
        const cleanedData = data.map(record => cleanRecordForPostgres(record));

        // Use 'created_at' and 'merchant_shortcode' for conflict resolution
        const { error } = await supabase
            .from(targetTable)
            .upsert(cleanedData, { 
                onConflict: 'merchant_shortcode,created_at', 
                ignoreDuplicates: true 
            });

        if (error) {
            console.error(`❌ SQL REJECTION [${targetTable}]:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ SUCCESS: Synced ${targetTable}`);
        res.status(200).json({ status: "success" });

    } catch (err) {
        console.error("❌ CRITICAL BRIDGE ERROR:", err.message);
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
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Bridge Live on Port ${PORT}`));
