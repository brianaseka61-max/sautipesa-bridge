const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

// THE TRANSLATOR FUNCTION
const mapToSupabase = (tableName, data) => {
    return data.map(item => {
        const clean = { ...item };

        // 1. DATE HANDSHAKE (Solves the 'null created_at' error)
        const dateSource = clean.created_at || clean.timestamp || clean.appointment_date;
        if (dateSource && dateSource.length > 5) {
            clean.created_at = dateSource;
        } else {
            clean.created_at = new Date().toISOString(); 
        }

        // 2. FIELD MAPPING (Ensures App fields match SQL columns)
        if (tableName === 'debts') {
            if (clean.phone_number) clean.customer_phone = clean.phone_number;
            if (clean.details) clean.item_details = clean.details;
        }
        
        if (tableName === 'products') {
            if (clean.product_name) clean.item_name = clean.product_name;
        }

        // 3. DATA TYPE CLEANING (Forces numbers to be numbers, not strings)
        const numericFields = ['amount', 'balance', 'total_amount', 'quantity', 'stock_level', 'buying_price', 'selling_price', 'reorder_level'];
        numericFields.forEach(field => {
            if (clean[field] !== undefined) {
                clean[field] = parseFloat(clean[field]) || 0;
            }
        });

        // 4. SECURITY (Remove local Android IDs that crash Supabase)
        delete clean._id;
        delete clean.id;
        delete clean.is_synced;
        delete clean.timestamp;

        return clean;
    });
};

app.post('/:table', async (req, res) => {
    let target = req.params.table;
    
    // Redirect table names if the app uses different names
    if (target === 'mpesa_transactions') target = 'mpesa_sales';
    
    let incomingData = Array.isArray(req.body) ? req.body : [req.body];

    try {
        const finalData = mapToSupabase(target, incomingData);

        // We use .insert() to ensure every sync attempt results in a record
        const { error } = await supabase.from(target).insert(finalData);

        if (error) {
            console.error(`❌ DB REJECTED [${target}]:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ SYNC COMPLETE: ${target} (${finalData.length} records)`);
        res.status(200).json({ status: "success" });

    } catch (err) {
        console.error("🔥 SERVER CRASH:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sauti Bridge Fully Mapped on Port ${PORT}`));
