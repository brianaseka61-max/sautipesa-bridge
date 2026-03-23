const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

// Registration endpoint for Onboarding
app.post('/register', async (req, res) => {
    try {
        const { error } = await supabase.from('merchants').upsert(req.body, { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(400).send(err.message);
    }
});

// Sync endpoint for all tables
app.post('/:table', async (req, res) => {
    const target = req.params.table;
    let rows = Array.isArray(req.body) ? req.body : [req.body];

    const cleanRows = rows.map(row => {
        const r = {};
        // Transfer all fields sent by the App
        Object.keys(row).forEach(key => {
            // ONLY remove local SQLite metadata
            if (!['_id', 'id', 'is_synced'].includes(key)) {
                r[key] = (row[key] === "" || row[key] === "null") ? null : row[key];
            }
        });

        // Ensure a timestamp exists
        if (!r.timestamp) r.timestamp = new Date().toISOString();
        
        return r;
    });

    try {
        const { error } = await supabase.from(target).insert(cleanRows);
        if (error) {
            console.error(`❌ ERROR in ${target}:`, error.message);
            return res.status(400).send(error.message);
        }
        console.log(`✅ SUCCESS: Synced to ${target}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(process.env.PORT || 10000, '0.0.0.0');
