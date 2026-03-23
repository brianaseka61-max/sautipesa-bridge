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
        
        // Fix Date: If timestamp exists, move it to created_at. 
        // If created_at is empty/null, DELETE it so Supabase uses DEFAULT NOW()
        if (r.timestamp) r.created_at = r.timestamp;
        if (!r.created_at || r.created_at === "" || r.created_at === "null") {
            delete r.created_at;
        }
        delete r.timestamp;

        // Ensure numbers are numbers
        const numFields = ['amount', 'balance', 'total_amount', 'price', 'quantity', 'stock_level', 'buying_price', 'selling_price'];
        numFields.forEach(f => { if (r[f]) r[f] = parseFloat(r[f]) || 0; });

        // Remove ID fields to let Supabase handle them
        delete r._id; delete r.id; delete r.is_synced;
        return r;
    });

    try {
        const key = (target === 'products') ? 'merchant_shortcode,item_name' : 'merchant_shortcode,created_at';
        const { error } = await supabase.from(target).upsert(cleanRows, { onConflict: key });

        if (error) {
            console.error(`❌ ERROR [${target}]:`, error.message);
            return res.status(400).send(error.message);
        }
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
