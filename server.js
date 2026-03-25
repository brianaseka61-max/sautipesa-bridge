const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
    'https://lzxhbtrpsrnsistngonk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI'
);

// Fixes Kenyan date format 'DD/MM/YY' to ISO for Postgres
function fixDateFormat(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('/')) return new Date().toISOString();
    try {
        const datePart = dateStr.split(' ')[0];
        const parts = datePart.split('/'); 
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${month}-${day}T00:00:00Z`;
        }
    } catch (e) { console.error("Date Error:", e.message); }
    return new Date().toISOString();
}

app.post('/:table', async (req, res) => {
    const table = req.params.table.toLowerCase();
    let data = Array.isArray(req.body) ? req.body : [req.body];

    const cleanRows = data.map(row => {
        const r = {};
        Object.keys(row).forEach(key => {
            const lowerKey = key.toLowerCase();
            
            // Skip SQLite internal IDs
            if (['_id', 'id', 'is_synced'].includes(lowerKey)) return;

            // Process values
            let value = row[key];
            if (value === "" || value === "null" || value === null) {
                value = null;
            }

            // Map keys and fix dates (Added appointment_date to the list)
            if (lowerKey === 'timestamp' || lowerKey === 'date' || lowerKey === 'created_at' || lowerKey === 'appointment_date') {
                r[lowerKey] = fixDateFormat(value);
            } else {
                r[lowerKey] = value;
            }
        });

        if (!r.timestamp) r.timestamp = new Date().toISOString();
        return r;
    });

    try {
        const { error } = await supabase.from(table).insert(cleanRows);
        if (error) {
            console.error(`❌ DB Error [${table}]:`, error.message);
            // If it's a "column not found" error, we log the payload to help you see what's missing
            console.error(`Attempted Columns:`, Object.keys(cleanRows[0]));
            return res.status(400).json({ error: error.message });
        }
        console.log(`✅ Success Sync to ${table}`);
        res.status(200).json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sauti Pesa Bridge LIVE on Port ${PORT}`));
