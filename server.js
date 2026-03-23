const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

// Onboarding endpoint
app.post('/register', async (req, res) => {
    try {
        const { error } = await supabase.from('merchants').upsert(req.body, { onConflict: 'shortcode' });
        if (error) throw error;
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(400).send(err.message);
    }
});

// Data sync endpoint
app.post('/:table', async (req, res) => {
    const targetTable = req.params.table;
    let incomingRows = Array.isArray(req.body) ? req.body : [req.body];

    const processedData = incomingRows.map(row => {
        const clean = {};
        
        // Loop through every key the App sent
        Object.keys(row).forEach(key => {
            // Only skip local SQLite internal IDs
            if (!['_id', 'id', 'is_synced'].includes(key)) {
                clean[key] = (row[key] === "" || row[key] === "null") ? null : row[key];
            }
        });

        // Ensure timestamp is valid
        if (!clean.timestamp) clean.timestamp = new Date().toISOString();

        return clean;
    });

    try {
        const { error } = await supabase.from(targetTable).insert(processedData);
        if (error) {
            console.error(`❌ DB REJECTED [${targetTable}]:`, error.message);
            return res.status(400).send(error.message);
        }
        console.log(`✅ SUCCESS: ${targetTable} synced.`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0');
