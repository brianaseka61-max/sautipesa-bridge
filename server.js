const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

const forceClean = (table, data) => {
    return data.map(item => {
        const clean = { ...item };

        // 🛠️ DATE FIX: The app sends 'timestamp', DB wants 'created_at'
        const dateVal = clean.created_at || clean.timestamp;
        if (dateVal && dateVal !== "" && dateVal !== "null") {
            clean.created_at = dateVal;
        } else {
            delete clean.created_at; // Let SQL default to NOW()
        }
        delete clean.timestamp;

        // 🛠️ COLUMN MAPPING
        if (table === 'products' && clean.item_name) clean.product_name = clean.item_name;
        if (table === 'debts') {
            if (clean.customer_phone) clean.phone_number = clean.customer_phone;
            if (clean.item_details) clean.details = clean.item_details;
        }
        if (table === 'appointments' && clean.appointment_date) clean.date = clean.appointment_date;

        // 🛠️ NUMERIC ENFORCEMENT
        const nums = ['amount', 'balance', 'total_amount', 'price', 'quantity', 'stock_level', 'buying_price', 'selling_price'];
        nums.forEach(n => {
            if (clean.hasOwnProperty(n)) {
                clean[n] = parseFloat(clean[n]) || 0;
            }
        });

        // Remove ID artifacts
        delete clean._id; delete clean.id; delete clean.is_synced;
        return clean;
    });
};

app.post('/:table', async (req, res) => {
    let target = req.params.table;
    if (target === 'mpesa_transactions') target = 'mpesa_sales';
    
    let body = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const data = forceClean(target, body);
        const key = (target === 'products') ? 'merchant_shortcode,product_name' : 'merchant_shortcode,created_at';

        const { error } = await supabase.from(target).upsert(data, { onConflict: key });

        if (error) {
            console.error(`❌ DB REJECTED [${target}]:`, error.message);
            return res.status(400).send(error.message);
        }
        console.log(`✅ SYNCED: ${target}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
