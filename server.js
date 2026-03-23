const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const smartClean = (table, data) => {
    return data.map(record => {
        const cleaned = { ...record };

        // 1. DATE FIX: Force created_at and remove timestamp
        cleaned.created_at = cleaned.created_at || cleaned.timestamp || new Date().toISOString();
        delete cleaned.timestamp;

        // 2. MAPPING FIX: Rename incoming fields to match SQL Exactly
        if (table === 'products') {
            if (cleaned.item_name) cleaned.product_name = cleaned.item_name;
            delete cleaned.item_name;
        }
        if (table === 'debts') {
            if (cleaned.customer_phone) cleaned.phone_number = cleaned.customer_phone;
            if (cleaned.item_details) cleaned.details = cleaned.item_details;
            delete cleaned.customer_phone;
            delete cleaned.item_details;
        }
        if (table === 'appointments') {
            if (cleaned.appointment_date) cleaned.date = cleaned.appointment_date;
            delete cleaned.appointment_date;
        }

        // 3. NUMERIC FIX: Prevent empty strings from crashing SQL
        const numericColumns = ['amount', 'balance', 'total_amount', 'price', 'quantity', 'stock_level', 'buying_price', 'selling_price', 'reorder_level'];
        numericColumns.forEach(col => {
            if (cleaned.hasOwnProperty(col)) {
                cleaned[col] = parseFloat(cleaned[col]) || 0;
            }
        });

        return cleaned;
    });
};

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let data = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const cleanedData = smartClean(targetTable, data);
        
        // Use product_name for inventory conflicts, created_at for everything else
        const conflictKey = (targetTable === 'products') ? 'merchant_shortcode,product_name' : 'merchant_shortcode,created_at';

        const { error } = await supabase
            .from(targetTable)
            .upsert(cleanedData, { 
                onConflict: conflictKey, 
                ignoreDuplicates: true 
            });

        if (error) {
            console.error(`❌ SQL ERROR [${targetTable}]:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ SUCCESS: ${targetTable} updated.`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Sauti Bridge Live`));
