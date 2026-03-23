const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

// YOUR CREDENTIALS
const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. ONBOARDING ENDPOINT (Fixes the 404 error)
app.post('/register', async (req, res) => {
    console.log("Registering Merchant:", req.body.business_name);
    try {
        const { error } = await supabase.from('merchants').upsert(req.body, { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error("Registration Error:", err.message);
        res.status(400).send(err.message);
    }
});

// 2. DATA SYNC ENDPOINT (For SyncManager)
app.post('/:table', async (req, res) => {
    let target = req.params.table;
    if (target === 'mpesa_transactions' || target === 'transactions') target = 'mpesa_sales';
    
    let rows = Array.isArray(req.body) ? req.body : [req.body];

    const cleanRows = rows.map(row => {
        const r = { ...row };
        
        // Ensure Date exists and is not null
        const dateVal = r.timestamp || r.created_at;
        if (!dateVal || dateVal === "null" || dateVal === "") {
            r.timestamp = new Date().toISOString();
        } else {
            r.timestamp = dateVal;
        }

        // Clean up local Android fields
        delete r._id; delete r.id; delete r.is_synced; delete r.created_at;

        // Force convert numbers
        ['total_sale', 'quantity_sold', 'total_debt_amount', 'remaining_balance', 'current_quantity'].forEach(f => {
            if (r[f]) r[f] = parseFloat(r[f]) || 0;
        });

        return r;
    });

    try {
        const { error } = await supabase.from(target).insert(cleanRows);
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error(`Sync Error [${target}]:`, err.message);
        res.status(400).send(err.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Sauti Bridge Active on Port ${PORT}`));
