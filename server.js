const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

const sanitize = (table, data) => {
    return data.map(item => {
        const row = { ...item };

        // 1. DATE DEFENSE: If timestamp is invalid/empty, remove it so DB handles it
        const rawDate = row.created_at || row.timestamp;
        if (rawDate && rawDate.length > 5) {
            row.created_at = rawDate;
        } else {
            delete row.created_at;
        }
        delete row.timestamp;

        // 2. MAPPING DEFENSE
        if (table === 'products' && row.item_name) row.product_name = row.item_name;
        if (table === 'debts') {
            if (row.customer_phone) row.phone_number = row.customer_phone;
            if (row.item_details) row.details = row.item_details;
        }
        if (table === 'appointments' && row.appointment_date) row.date = row.appointment_date;

        // 3. NUMBER DEFENSE: Prevent "" or null from crashing NUMERIC columns
        const numericCols = ['amount', 'balance', 'total_amount', 'price', 'quantity', 'stock_level', 'buying_price', 'selling_price', 'reorder_level'];
        numericCols.forEach(col => {
            if (row.hasOwnProperty(col)) {
                const val = parseFloat(row[col]);
                row[col] = isNaN(val) ? 0 : val;
            }
        });

        // 4. CLEANUP: Remove local SQLite keys
        delete row._id; delete row.id; delete row.is_synced;
        return row;
    });
};

app.post('/:table', async (req, res) => {
    let target = req.params.table;
    if (target === 'mpesa_transactions') target = 'mpesa_sales';
    
    let body = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const cleanData = sanitize(target, body);
        const conflictKey = (target === 'products') ? 'merchant_shortcode,product_name' : 'merchant_shortcode,created_at';

        const { error } = await supabase.from(target).upsert(cleanData, { onConflict: conflictKey });

        if (error) {
            console.error(`❌ ERROR [${target}]:`, error.message);
            return res.status(400).send(error.message);
        }
        console.log(`✅ SYNCED: ${target} (${cleanData.length} rows)`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
