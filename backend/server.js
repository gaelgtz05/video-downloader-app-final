const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares Esenciales ---
app.use(cors()); // Permite la comunicación desde tu frontend
app.use(express.static(path.join(__dirname, '../frontend'))); // Sirve tu index.html

// --- Ruta Principal de la Aplicación ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// --- EL ÚNICO ENDPOINT QUE NECESITAS ---
app.get('/download', async (req, res) => {
    const { url, format } = req.query; // Recibimos la URL y el formato (mp3/mp4)

    // 1. Validamos que la URL sea correcta
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'URL de YouTube no válida.' });
    }

    try {
        // 2. Obtenemos la información del video para sacar el título
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\x00-\x7F]/g, "") || 'video'; // Limpiamos el título

        let options = {};
        let filename = '';

        // 3. Configuramos las opciones de descarga según el formato
        if (format === 'mp3') {
            options = { filter: 'audioonly', quality: 'highestaudio' };
            filename = `${title}.mp3`;
        } else { // Por defecto será MP4
            options = { quality: 'highest' };
            filename = `${title}.mp4`;
        }

        // 4. Establecemos las cabeceras para que el navegador descargue el archivo
        res.header('Content-Disposition', `attachment; filename="${filename}"`);
        if (format === 'mp3') {
            res.header('Content-Type', 'audio/mpeg');
        } else {
            res.header('Content-Type', 'video/mp4');
        }

        // 5. ¡La Magia! Hacemos streaming del video directamente al usuario.
        // Esto es muy eficiente, no guarda nada en el servidor.
        ytdl(url, options).pipe(res);

    } catch (error) {
        console.error('Error durante la descarga:', error);
        res.status(500).json({ error: 'No se pudo procesar el video.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo y escuchando en el puerto ${PORT}`);
    console.log(`Accede a la app en: http://localhost:${PORT}`);
});
