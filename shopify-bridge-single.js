const express = require('express');
const fetch = require('node-fetch');

const app = express();

app.get('/api/data', async (req, res) => {
    try {
        const response = await fetch('https://api.example.com/data');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).send('Error fetching data');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});