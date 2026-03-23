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
    
    let rows = Array.isArray(req.body) ? req.body : [req.body];

    const cleanRows = rows.map(row => {
        const r = { ...row };
        
        // Fix the Date Error: Always provide a valid ISO string if missing
        if (r.timestamp && r.timestamp.length > 5) {
            r.created_at = r.timestamp;
        } else {
            r.created_at = new Date().toISOString();
        }
        
        // Final Safety: Remove fields that don't belong in SQL
        delete r.timestamp; delete r._id; delete r.id; delete r.is_synced;

        // Force convert numbers
        const nums = ['amount', 'balance', 'total_amount', 'stock_level', 'selling_price', 'buying_price'];
        nums.forEach(f => { if (r[f] !== undefined) r[f] = parseFloat(r[f]) || 0; });

        return r;
    });

    try {
        // Use .insert() instead of .upsert() to avoid "Conflict" and "Constraint" errors
        const { error } = await supabase.from(target).insert(cleanRows);

        if (error) {
            console.error(`❌ DB REJECTED [${target}]:`, error.message);
            return res.status(400).send(error.message);
        }
        console.log(`✅ DATA SAVED: ${target}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
