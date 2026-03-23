const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.post('/register', async (req, res) => {
    try {
        const { error } = await supabase.from('merchants').upsert(req.body, { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(400).send(err.message);
    }
});

app.post('/:table', async (req, res) => {
    const targetTable = req.params.table;
    let data = Array.isArray(req.body) ? req.body : [req.body];

    const cleanData = data.map(row => {
        const r = { ...row };
        
        // FIX: Ensure product_id is never null for sales
        if (targetTable === 'sales_history' && !r.product_id) {
            r.product_id = 0; 
        }

        // Standardize timestamps
        r.timestamp = r.timestamp || new Date().toISOString();

        // Remove local SQLite metadata that Supabase doesn't want
        delete r._id; 
        delete r.id; 
        delete r.is_synced;

        return r;
    });

    try {
        const { error } = await supabase.from(targetTable).insert(cleanData);
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error(`Error in ${targetTable}:`, err.message);
        res.status(400).send(err.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Sauti Bridge Active`));
