const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

app.post('/:table', async (req, res) => {
    // FORCE LOWERCASE: This fixes the "Relation does not exist" error
    const table = req.params.table.toLowerCase(); 
    console.log(`--- Syncing to: ${table} ---`);

    let data = Array.isArray(req.body) ? req.body : [req.body];

    const cleanRows = data.map(row => {
        const r = {};
        Object.keys(row).forEach(key => {
            // Remove local SQLite IDs
            if (!['_id', 'id', 'is_synced'].includes(key.toLowerCase())) {
                r[key.toLowerCase()] = (row[key] === "" || row[key] === "null") ? null : row[key];
            }
        });
        if (!r.timestamp) r.timestamp = new Date().toISOString();
        return r;
    });

    try {
        const { error } = await supabase.from(table).insert(cleanRows);

        if (error) {
            console.error(`❌ DB Error [${table}]:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ Success: ${cleanRows.length} rows synced to ${table}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        console.error(`❌ Bridge Crash:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sauti Pesa Bridge LIVE on ${PORT}`));
