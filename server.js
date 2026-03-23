const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '50mb' }));

const SUPABASE_URL = 'https://lzxhbtrpsrnsistngonk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6eGhidHJwc3Juc2lzdG5nb25rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyMDI5MSwiZXhwIjoyMDg3MDk2MjkxfQ.EAGXtILYQ-dNrMxs_WeQvAxtsKeIIDqlmnOyFauAAHI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper to parse the Android Date format (dd/MM/yy HH:mm) to ISO
const parseDate = (dateStr) => {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    try {
        const [datePart, timePart] = dateStr.split(' ');
        const [d, m, y] = datePart.split('/');
        const year = y.length === 2 ? `20${y}` : y;
        return `${year}-${m}-${d}T${timePart || '00:00'}:00Z`;
    } catch (e) {
        return dateStr;
    }
};

app.post('/:targetTable', async (req, res) => {
    const { targetTable } = req.params;
    let records = Array.isArray(req.body) ? req.body : [req.body];

    // Clean dates to ensure database stability
    const cleanData = records.map(item => ({
        ...item,
        timestamp: parseDate(item.timestamp || item.created_at)
    }));

    try {
        const { error } = await supabase
            .from(targetTable)
            .upsert(cleanData, { onConflict: 'merchant_shortcode,timestamp' });

        if (error) {
            console.error(`❌ Sync Error [${targetTable}]:`, error.message);
            return res.status(400).json({ error: error.message });
        }

        console.log(`✅ Stable Sync: ${cleanData.length} records to ${targetTable}`);
        res.status(200).json({ status: "success" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`📡 SautiPesa Bridge Active on ${PORT}`));
