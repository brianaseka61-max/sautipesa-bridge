const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const processRow = (table, data) => {
    return data.map(item => {
        const row = { ...item };
        // Date Fix
        row.created_at = row.created_at || row.timestamp || new Date().toISOString();
        delete row.timestamp;

        // Smart Mapping
        if (table === 'products' && row.item_name) row.product_name = row.item_name;
        if (table === 'debts') {
            if (row.customer_phone) row.phone_number = row.customer_phone;
            if (row.item_details) row.details = row.item_details;
        }
        if (table === 'appointments' && row.appointment_date) row.date = row.appointment_date;

        // Clean Numbers (Force 0 if empty)
        const nums = ['amount', 'balance', 'total_amount', 'price', 'quantity', 'stock_level', 'buying_price', 'selling_price'];
        nums.forEach(n => { if (row.hasOwnProperty(n)) row[n] = parseFloat(row[n]) || 0; });

        // Remove ID fields coming from Android to let Supabase generate them
        delete row._id; delete row.id; delete row.is_synced;

        return row;
    });
};

app.post('/:target', async (req, res) => {
    let targetTable = req.params.target;
    // Redirect App names to SQL names
    if (targetTable === 'mpesa_transactions') targetTable = 'mpesa_sales';
    
    let payload = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const cleanData = processRow(targetTable, payload);
        const key = (targetTable === 'products') ? 'merchant_shortcode,product_name' : 'merchant_shortcode,created_at';

        const { error } = await supabase.from(targetTable).upsert(cleanData, { onConflict: key });

        if (error) {
            console.error(`❌ REJECTED [${targetTable}]:`, error.message);
            return res.status(400).send(error.message);
        }
        res.status(200).json({ status: "ok" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
