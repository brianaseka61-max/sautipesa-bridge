const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

// Function to fix the '23/3/26' date format to '2026-03-23'
function fixDateFormat(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('/')) return new Date().toISOString();
    const parts = dateStr.split(' ')[0].split('/'); // Handles '22/03/26 03:39' -> ['22','03','26']
    if (parts.length === 3) {
        // Assuming DD/MM/YY format from your logs
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = `20${parts[2]}`; 
        return `${year}-${month}-${day}T00:00:00Z`;
    }
    return new Date().toISOString();
}

app.post('/:table', async (req, res) => {
    const table = req.params.table.toLowerCase();
    let data = Array.isArray(req.body) ? req.body : [req.body];

    const cleanRows = data.map(row => {
        const r = {};
        Object.keys(row).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (!['_id', 'id', 'is_synced'].includes(lowerKey)) {
                // If the key is a date/timestamp field, fix the format
                if (lowerKey === 'timestamp' || lowerKey === 'date') {
                    r[lowerKey] = fixDateFormat(row[key]);
                } else {
                    r[lowerKey] = (row[key] === "" || row[key] === "null") ? null : row[key];
                }
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
        console.log(`✅ Success Sync to ${table}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Bridge LIVE` ));
