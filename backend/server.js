// backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { exec, spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- RUTA A YT-DLP (YA CORREGIDA PARA TU SISTEMA GAEL!) ---
const YT_DLP_COMMAND = '/Users/gaelsosaa/Library/Python/3.9/bin/yt-dlp';


// --- RUTA A FFMPEG (¡YA CORREGIDA PARA TU SISTEMA!) ---
ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg');


// --- Servir archivos estáticos del frontend ---
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.get('/:file', (req, res) => {
    const filePath = path.join(__dirname, '../frontend', req.params.file);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`Error al servir ${req.params.file}:`, err);
            res.status(404).send('Archivo no encontrado.');
        }
    });
});

// --- Endpoint para iniciar la descarga ---
app.post('/download-start', async (req, res) => {
    const { url, format, sessionId } = req.body;

    if (!url || !url.startsWith('http')) {
        console.warn(`[${sessionId}] URL inválida o no proporcionada: ${url}`);
        return res.status(400).json({ status: 'error', message: 'URL de video inválida.' });
    }

    console.log(`[${sessionId}] Solicitud de descarga recibida para: ${url} en formato: ${format}`);
    io.to(sessionId).emit('progress', { status: 'starting', message: 'Iniciando descarga (con yt-dlp)...' });

    const tempDir = path.join(__dirname, 'temp_downloads');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    const tempFileNamePrefix = `${crypto.randomBytes(8).toString('hex')}`;
    
    let finalFilename = '';

    try {
        const spawnOptions = { shell: true, timeout: 180000 }; // Timeout extendido a 3 minutos

        // --- Argumentos de yt-dlp para obtener información y descargar (¡CON DVS PO TOKEN!) ---
        let baseDlpArgs = ['-v']; // Modo detallado
        baseDlpArgs.push('--ffmpeg-location', '/opt/homebrew/bin/ffmpeg'); 
        baseDlpArgs.push('--extractor-args', 'youtube:dpo_token=true'); // AÑADIDO: Para manejar el DVS PO Token

        // Comando para obtener información (con argumentos base)
        const infoCommandArgs = [...baseDlpArgs, '--print-json', `"${url}"`]; // URL entre comillas para el shell
        const infoCommandString = `${YT_DLP_COMMAND} ${infoCommandArgs.join(' ')}`;
        console.log(`[${sessionId}] Ejecutando yt-dlp para info (VERBOSE): ${infoCommandString}`);
        const infoProcess = spawn(infoCommandString, spawnOptions);

        let infoData = '';
        let infoProcessError = ''; 

        infoProcess.stdout.on('data', (data) => {
            infoData += data.toString();
            console.log(`[${sessionId}] yt-dlp info stdout chunk (VERBOSE): ${data.toString().trim()}`);
        });

        infoProcess.stderr.on('data', (data) => {
            infoProcessError += data.toString();
            console.error(`[${sessionId}] yt-dlp info stderr (VERBOSE): ${data.toString().trim()}`);
        });
        
        await new Promise((resolve, reject) => {
            infoProcess.on('close', (code) => {
                console.log(`[${sessionId}] yt-dlp info process closed with code: ${code}`);
                if (code === 0) {
                    try {
                        const parsedInfo = JSON.parse(infoData);
                        resolve(parsedInfo);
                    } catch (e) {
                        console.error(`[${sessionId}] Error al parsear JSON de yt-dlp info:`, e.message);
                        reject(new Error(`Error al parsear información de yt-dlp: ${e.message}. Salida: ${infoData.substring(0,200)}...`));
                    }
                } else {
                    console.error(`[${sessionId}] yt-dlp info process exited with non-zero code ${code}. Error: ${infoProcessError}`);
                    reject(new Error(`yt-dlp falló al obtener información (código ${code}). Mensaje: ${infoProcessError.substring(0,200)}...`));
                }
            });
            infoProcess.on('error', (err) => {
                console.error(`[${sessionId}] Error al ejecutar yt-dlp para info (spawn error):`, err.message);
                reject(new Error(`Error al ejecutar yt-dlp para info: ${err.message}`));
            });
            infoProcess.on('timeout', () => {
                console.error(`[${sessionId}] yt-dlp info process timed out.`);
                infoProcess.kill();
                reject(new Error(`yt-dlp info process timed out after ${spawnOptions.timeout / 1000} seconds.`));
            });
        }).then(info => {
            console.log(`[${sessionId}] Información de video obtenida: ${info.title}`);
            let title = info.title ? info.title.replace(/[^\w\s.-]/g, '').substring(0, 100) : `video_descargado_${tempFileNamePrefix}`;
            if (!title) title = `video_descargado_${tempFileNamePrefix}`;

            // --- Construcción de argumentos de descarga de yt-dlp (con DVS PO TOKEN y otros) ---
            let ytDlpDownloadArgs = [...baseDlpArgs]; // Usa los argumentos base
            
            if (format === 'mp3') {
                ytDlpDownloadArgs.push('-f', 'bestaudio[ext=mp3]/bestaudio');
                ytDlpDownloadArgs.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
                finalFilename = `${title}.mp3`;
            } else if (format === 'mp4') {
                ytDlpDownloadArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best'); 
                ytDlpDownloadArgs.push('--recode-video', 'mp4'); 
                finalFilename = `${title}.mp4`;
            } else {
                throw new Error('Formato no soportado.');
            }

            const tempFilePath = path.join(tempDir, `${tempFileNamePrefix}.%(ext)s`);
            ytDlpDownloadArgs.push('-o', `"${tempFilePath}"`, `"${url}"`); // Rutas y URL entre comillas para el shell

            const downloadCommandString = `${YT_DLP_COMMAND} ${ytDlpDownloadArgs.join(' ')}`;
            console.log(`[${sessionId}] Iniciando descarga de video/audio con yt-dlp (VERBOSE): ${downloadCommandString}`);
            
            const ytDlpProcess = spawn(downloadCommandString, spawnOptions); 
            let currentFilePath = '';
            let processStdErr = '';

            ytDlpProcess.stdout.on('data', (data) => {
                const line = data.toString();
                console.log(`[${sessionId}] yt-dlp download stdout (VERBOSE): ${line.trim()}`);
                
                const percentMatch = line.match(/(\d+\.\d+)% of/);
                const downloadDestinationMatch = line.match(/\[download\] Destination: (.+)/);
                
                if (percentMatch) {
                    const percent = parseFloat(percentMatch[1]);
                    io.to(sessionId).emit('progress', { status: 'downloading', percent: percent, message: `Descargando: ${percent.toFixed(1)}%` });
                } else if (line.includes('[ExtractAudio]')) {
                    io.to(sessionId).emit('progress', { status: 'extracting', message: 'Extrayendo audio...' });
                } else if (line.includes('[Merger]') || line.includes('Postprocessing')) {
                    io.to(sessionId).emit('progress', { status: 'merging', message: 'Fusionando/procesando video y audio...' });
                } else if (downloadDestinationMatch) {
                    currentFilePath = downloadDestinationMatch[1].trim();
                    console.log(`[${sessionId}] yt-dlp reporta archivo en: ${currentFilePath}`);
                }
            });

            ytDlpProcess.stderr.on('data', (data) => {
                processStdErr += data.toString();
                console.error(`[${sessionId}] yt-dlp download stderr (VERBOSE): ${data.toString().trim()}`);
            });

            ytDlpProcess.on('close', (code) => {
                console.log(`[${sessionId}] yt-dlp download process closed with code: ${code}`);
                if (code === 0 && currentFilePath) {
                    const downloadedFileNameWithExt = path.basename(currentFilePath);
                    finalFilename = downloadedFileNameWithExt; 

                    io.to(sessionId).emit('progress', {
                        status: 'completed_on_server',
                        message: 'Descarga lista para tu navegador.',
                        filepath: finalFilename
                    });
                    console.log(`[${sessionId}] Procesamiento finalizado y enlace enviado: ${finalFilename}`);
                    res.status(200).json({ status: 'success', message: 'Procesamiento iniciado, espera el enlace de descarga.' });

                } else {
                    const errorMessage = `yt-dlp no completó la descarga (código ${code}). Error: ${processStdErr.substring(0, 200)}...`;
                    console.error(`[${sessionId}] ERROR: ${errorMessage}`);
                    io.to(sessionId).emit('progress', { status: 'error', message: `Error en la descarga: ${errorMessage}` });
                    if (!res.headersSent) {
                        res.status(500).json({ status: 'error', message: errorMessage });
                    }
                }
            });
            ytDlpProcess.on('error', (err) => {
                console.error(`[${sessionId}] Error al ejecutar yt-dlp (download spawn error): ${err.message}`);
                io.to(sessionId).emit('progress', { status: 'error', message: `Error al iniciar yt-dlp para descarga: ${err.message.substring(0, 100)}...` });
                if (!res.headersSent) {
                    res.status(500).json({ status: 'error', message: `Error de servidor: ${err.message}` });
                }
            });
            ytDlpProcess.on('timeout', () => {
                console.error(`[${sessionId}] yt-dlp download process timed out.`);
                ytDlpProcess.kill();
                io.to(sessionId).emit('progress', { status: 'error', message: `Descarga de yt-dlp excedió el tiempo límite.` });
            });


        }).catch(error => {
            console.error(`[${sessionId}] Excepción al obtener info de yt-dlp o en promesa (infoProcess):`, error);
            io.to(sessionId).emit('progress', { status: 'error', message: `Error al obtener info del video: ${error.message.substring(0, 100)}...` });
            if (!res.headersSent) {
                res.status(500).json({ status: 'error', message: `Error interno: ${error.message}` });
            }
        });

    } catch (error) {
        console.error(`[${sessionId}] Excepción general en /download-start:`, error);
        io.to(sessionId).emit('progress', { status: 'error', message: `Error inesperado: ${error.message.substring(0, 100)}...` });
        if (!res.headersSent) {
            res.status(500).json({ status: 'error', message: `Error general: ${error.message}` });
        }
    } finally {
        const tempFileToRemove = path.join(tempDir, finalFilename);
        if (finalFilename && fs.existsSync(tempFileToRemove)) {
            setTimeout(() => {
                fs.unlink(tempFileToRemove, (err) => {
                    if (err) console.error(`Error al borrar archivo temporal ${tempFileToRemove}:`, err);
                    else console.log(`Archivo temporal ${tempFileToRemove} borrado.`);
                });
            }, 60000);
        }
    }
});

app.get('/download-file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'temp_downloads', filename);

    if (!fs.existsSync(filePath)) {
        console.error(`Archivo no encontrado para servir: ${filePath}`);
        return res.status(404).send('Archivo no encontrado o ya fue borrado.');
    }

    res.download(filePath, filename, (err) => {
        if (err) {
            console.error(`Error al enviar archivo ${filename}:`, err);
            res.status(500).send('Error al descargar el archivo.');
        } else {
            console.log(`Archivo ${filename} enviado al cliente y descarga completada en navegador.`);
        }
    });
});

io.on('connection', (socket) => {
    console.log('Cliente Socket.IO conectado:', socket.id);
    socket.on('joinSession', (sessionId) => {
        socket.join(sessionId);
        console.log(`Cliente ${socket.id} unido a la sesión ${sessionId}`);
    });
    socket.on('disconnect', () => {
        console.log('Cliente Socket.IO desconectado:', socket.id);
    });
});


server.listen(PORT, () => {
    console.log(`\n--- SERVIDOR NODE.JS INICIADO ---`);
    console.log(`Accede a tu aplicación web en: http://localhost:${PORT}`);
    console.log(`Presiona Ctrl+C para detener el servidor.`);
    console.log(`Archivos temporales se guardarán en: ${path.join(__dirname, 'temp_downloads')}\n`);
});
