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
    // Map internal app table names to Supabase table names
    if (target === 'transactions') target = 'mpesa_sales';
    
    let incomingRows = Array.isArray(req.body) ? req.body : [req.body];

    const finalData = incomingRows.map(row => {
        const clean = {};

        // 1. DYNAMIC COLUMN MAPPING (App Name -> Supabase Name)
        const mapping = {
            'timestamp': 'created_at',
            'product_name': 'item_name',
            'total_sale': 'total_amount',
            'quantity_sold': 'quantity',
            'customer_number': 'customer_phone',
            'total_debt_amount': 'amount',
            'remaining_balance': 'balance',
            'description': 'details',
            'selling_price_unit': 'selling_price',
            'buying_price_bulk': 'buying_price',
            'current_quantity': 'stock_level',
            'interest': 'notes'
        };

        Object.keys(row).forEach(key => {
            const newKey = mapping[key] || key;
            
            // Skip local Android IDs and sync flags
            if (!['_id', 'id', 'is_synced'].includes(key)) {
                let value = row[key];
                
                // Convert empty strings to null for better DB handling
                if (value === "" || value === "null") value = null;
                
                clean[newKey] = value;
            }
        });

        // 2. EMERGENCY DATE FIX
        if (!clean.created_at) {
            clean.created_at = new Date().toISOString();
        }

        return clean;
    });

    try {
        const { error } = await supabase.from(target).insert(finalData);

        if (error) {
            console.error(`❌ DB REJECTED [${target}]:`, error.message);
            return res.status(400).send(error.message);
        }

        console.log(`✅ SUCCESS: ${target} synced ${finalData.length} rows.`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
