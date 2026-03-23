const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

app.post('/:table', async (req, res) => {
    let target = req.params.table;
    if (target === 'mpesa_transactions') target = 'mpesa_sales';
    
    let incomingRows = Array.isArray(req.body) ? req.body : [req.body];

    const finalizedRows = incomingRows.map(row => {
        const clean = {};
        
        // 1. THE DATE FIX (Crucial for your error)
        // If app sends 'timestamp', move it to 'created_at'. 
        // If both are empty, let Supabase handle it via DEFAULT NOW().
        const dateVal = row.timestamp || row.created_at;
        if (dateVal && dateVal !== "null" && dateVal !== "") {
            clean.created_at = dateVal;
        }

        // 2. COLUMN MAPPING (Ensures App matches SQL)
        if (row.item_name) clean.item_name = row.item_name;
        if (row.customer_phone) clean.customer_phone = row.customer_phone;
        if (row.item_details) clean.item_details = row.item_details;
        if (row.product_name) clean.item_name = row.product_name;

        // 3. COPY ALL OTHER FIELDS
        Object.keys(row).forEach(key => {
            if (!['timestamp', 'created_at', '_id', 'id', 'is_synced'].includes(key)) {
                clean[key] = row[key];
            }
        });

        // 4. NUMBER CLEANING
        const nums = ['amount', 'total_amount', 'balance', 'quantity', 'stock_level', 'selling_price', 'buying_price'];
        nums.forEach(f => {
            if (clean[f]) clean[f] = parseFloat(clean[f]) || 0;
        });

        return clean;
    });

    try {
        // Insert data into Supabase
        const { error } = await supabase.from(target).insert(finalizedRows);

        if (error) {
            console.error(`❌ DB REJECTED [${target}]:`, error.message);
            return res.status(400).send(error.message);
        }

        console.log(`✅ SYNC SUCCESS: ${target}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
