const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const cleanAndMap = (table, data) => {
    return data.map(item => {
        const cleaned = { ...item };

        // 1. DATE STANDARDIZATION
        cleaned.created_at = cleaned.created_at || cleaned.timestamp || new Date().toISOString();
        delete cleaned.timestamp;

        // 2. COLUMN MAPPING (The "Bridge" between Android names and SQL names)
        if (table === 'debts') {
            if (cleaned.customer_phone) { cleaned.phone_number = cleaned.customer_phone; delete cleaned.customer_phone; }
            if (cleaned.item_details) { cleaned.details = cleaned.item_details; delete cleaned.item_details; }
        }
        
        if (table === 'appointments') {
            if (cleaned.appointment_date) { cleaned.date = cleaned.appointment_date; delete cleaned.appointment_date; }
        }

        // 3. NUMERIC STABILITY
        const numericFields = ['total_amount', 'amount', 'price', 'buying_price', 'selling_price', 'stock_level', 'quantity', 'balance'];
        numericFields.forEach(field => {
            if (cleaned.hasOwnProperty(field)) {
                if (cleaned[field] === "" || cleaned[field] === null || cleaned[field] === "null") {
                    cleaned[field] = 0;
                } else {
                    cleaned[field] = parseFloat(cleaned[field]) || 0;
                }
            }
        });

        return cleaned;
    });
};

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const cleanedData = cleanAndMap(targetTable, data);
        
        // Dynamic Conflict Clause
        const conflictColumns = targetTable === 'products' ? 'merchant_shortcode,product_name' : 'merchant_shortcode,created_at';

        const { error } = await supabase
            .from(targetTable)
            .upsert(cleanedData, { 
                onConflict: conflictColumns, 
                ignoreDuplicates: true 
            });

        if (error) {
            console.error(`❌ SQL REJECTED [${targetTable}]:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ SUCCESS: ${targetTable} sync.`);
        res.status(200).json({ status: "success" });

    } catch (err) {
        console.error("❌ SYSTEM ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Sauti Bridge Active`));
