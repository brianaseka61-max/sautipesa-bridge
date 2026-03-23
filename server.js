const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

// SUPABASE CREDENTIALS
const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. ONBOARDING ENDPOINT (For OnboardingActivity.java)
app.post('/register', async (req, res) => {
    console.log("Onboarding Request Received...");
    try {
        const { error } = await supabase.from('merchants').upsert(req.body, { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error("Onboarding Error:", err.message);
        res.status(400).send(err.message);
    }
});

// 2. MAIN SYNC ENDPOINT (For SyncManager.java)
app.post('/:table', async (req, res) => {
    const targetTable = req.params.table;
    let data = Array.isArray(req.body) ? req.body : [req.body];

    const cleanData = data.map(row => {
        const r = { ...row };
        
        // Handle Date/Timestamp translation
        const actualDate = r.timestamp || r.created_at || new Date().toISOString();
        r.timestamp = actualDate;

        // Strip local Android IDs
        delete r._id; delete r.id; delete r.is_synced; delete r.created_at;

        // Number formatting for Supabase
        const nums = ['total_sale', 'quantity_sold', 'total_debt_amount', 'remaining_balance', 'current_quantity'];
        nums.forEach(f => { if (r[f]) r[f] = parseFloat(r[f]) || 0; });

        return r;
    });

    try {
        // Use UPSERT for merchants/credentials to avoid duplicates
        const useUpsert = ['merchants', 'business_credentials'].includes(targetTable);
        const { error } = useUpsert 
            ? await supabase.from(targetTable).upsert(cleanData, { onConflict: 'shortcode' })
            : await supabase.from(targetTable).insert(cleanData);

        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error(`Sync Error [${targetTable}]:`, err.message);
        res.status(400).send(err.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Sauti Pesa Bridge running on ${PORT}`));
