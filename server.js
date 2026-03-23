const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const finalizeData = (table, data) => {
    return data.map(record => {
        const row = { ...record };

        // Force standard date
        row.created_at = row.created_at || row.timestamp || new Date().toISOString();
        delete row.timestamp;

        // Smart Mapping for App-to-DB consistency
        if (table === 'products' && row.item_name) {
            row.product_name = row.item_name;
            delete row.item_name;
        }
        if (table === 'debts') {
            if (row.customer_phone) row.phone_number = row.customer_phone;
            if (row.item_details) row.details = row.item_details;
            delete row.customer_phone;
            delete row.item_details;
        }
        if (table === 'appointments' && row.appointment_date) {
            row.date = row.appointment_date;
            delete row.appointment_date;
        }

        // Fix Numeric types (Prevents Syntax Error)
        const numFields = ['amount', 'balance', 'total_amount', 'price', 'quantity', 'stock_level', 'buying_price', 'selling_price'];
        numFields.forEach(f => {
            if (row.hasOwnProperty(f)) row[f] = parseFloat(row[f]) || 0;
        });

        return row;
    });
};

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let payload = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const cleanPayload = finalizeData(targetTable, payload);
        const conflictKey = (targetTable === 'products') ? 'merchant_shortcode,product_name' : 'merchant_shortcode,created_at';

        const { error } = await supabase
            .from(targetTable)
            .upsert(cleanPayload, { onConflict: conflictKey, ignoreDuplicates: true });

        if (error) {
            console.error(`❌ DB REJECTED [${targetTable}]:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`📡 Sauti Bridge Online`));
