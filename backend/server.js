const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Sirve los archivos del frontend
app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// La ruta de descarga
app.get('/download', async (req, res) => {
    const { url, format } = req.query;

    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).send('URL de YouTube no válida.');
    }

    try {
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\x00-\x7F]/g, '') || 'video';
        
        let options = {};
        let filename = '';

        if (format === 'mp3') {
            options = { filter: 'audioonly', quality: 'highestaudio' };
            filename = `${title}.mp3`;
            res.header('Content-Type', 'audio/mpeg');
        } else {
            options = { quality: 'highest' };
            filename = `${title}.mp4`;
            res.header('Content-Type', 'video/mp4');
        }

        res.header('Content-Disposition', `attachment; filename="${filename}"`);
        ytdl(url, options).pipe(res);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error al procesar el video.');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en el puerto ${PORT}`);
});
