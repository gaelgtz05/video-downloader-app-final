// frontend/script.js

// La URL de tu backend público en Render.com
// Render la detectará automáticamente para la conexión WebSocket
// Si el nombre de tu servicio en Render fuera diferente, ajusta esta URL.
const BACKEND_URL = 'https://video-downloader-app-final.onrender.com'; 

// Elementos del DOM (Interfaz de usuario)
const urlInput = document.getElementById('urlInput');
const downloadButton = document.getElementById('downloadButton');
const progressBar = document.getElementById('progressBar');
const statusMessage = document.getElementById('statusMessage');
const formatOptions = document.getElementsByName('format');
const downloadLink = document.getElementById('downloadLink');

let socket; // Variable para la conexión WebSocket
let currentDownloadSessionId = null; // Para rastrear la descarga actual

// --- Función para inicializar la conexión WebSocket ---
function initWebSocket() {
    if (socket && socket.connected) {
        console.log("Socket.IO ya conectado, no se intenta reconectar.");
        return;
    }

    console.log(`Intentando conectar Socket.IO a: ${BACKEND_URL}`);
    // ¡CRÍTICO! Especificar la ruta y transportes para Socket.IO en entornos de despliegue
    socket = io(BACKEND_URL, {
        path: '/socket.io/', // Ruta estándar donde Socket.IO espera las conexiones
        transports: ['websocket', 'polling'] // Priorizar WebSockets, luego polling (más robusto)
    });

    socket.on('connect', () => {
        console.log('--- Socket.IO: Conectado al servidor backend. ---');
        statusMessage.textContent = 'Servicio conectado. Pega un enlace.';
        downloadButton.disabled = false; // Habilita el botón al conectar
        progressBar.style.width = '0%';
        downloadLink.style.display = 'none';
    });

    socket.on('disconnect', () => {
        console.log('--- Socket.IO: Desconectado del servidor backend. ---');
        statusMessage.textContent = 'Servicio desconectado. Asegúrate de que el backend esté corriendo.';
        downloadButton.disabled = true;
        progressBar.style.width = '0%';
        downloadLink.style.display = 'none';
        // Intenta reconectar después de un tiempo
        setTimeout(initWebSocket, 3000); 
    });

    socket.on('connect_error', (error) => {
        console.error('--- Socket.IO: Error de conexión ---', error);
        statusMessage.textContent = 'No se pudo conectar al backend. Asegúrate de que esté corriendo.';
        downloadButton.disabled = true;
        progressBar.style.width = '0%';
        downloadLink.style.display = 'none';
        // Intenta reconectar después de un tiempo
        setTimeout(initWebSocket, 5000); 
    });

    // --- Manejo de eventos de progreso del backend ---
    socket.on('progress', (data) => {
        console.log('--- Socket.IO: Progreso recibido ---', data); 
        
        // Solo actualiza si el evento es para la descarga que iniciamos
        if (data.sessionId === currentDownloadSessionId) {
            if (data.status === 'starting') {
                statusMessage.textContent = data.message;
                progressBar.style.width = '0%';
                downloadLink.style.display = 'none';
            } else if (data.status === 'downloading') {
                const percent = parseFloat(data.percent);
                if (!isNaN(percent)) {
                    progressBar.style.width = `${percent}%`;
                    statusMessage.textContent = `Descargando: ${percent.toFixed(1)}%`;
                } else {
                    // Si por alguna razón el porcentaje no es numérico, sigue mostrando el mensaje
                    statusMessage.textContent = `Descargando... (Progreso: ${data.message || 'calculando'})`;
                }
            } else if (data.status === 'extracting' || data.status === 'merging') {
                statusMessage.textContent = data.message;
                progressBar.style.width = '100%'; // Para indicar fase final de procesamiento
            } else if (data.status === 'completed_on_server') {
                statusMessage.textContent = data.message; // "Descarga lista para tu navegador."
                progressBar.style.width = '100%';

                const filename = data.filepath.split('/').pop().split('\\').pop(); 
                downloadLink.href = `${BACKEND_URL}/download-file/${encodeURIComponent(filename)}`;
                downloadLink.style.display = 'block'; // Muestra el enlace
                downloadLink.textContent = `Haz clic para descargar: ${filename}`;

                statusMessage.textContent = `✅ Descarga completada.`; // Mensaje final de éxito
                downloadButton.disabled = false; // Habilita el botón para una nueva descarga
                currentDownloadSessionId = null; // Reinicia el ID de sesión
                console.log(`Descarga finalizada en servidor. Enlace: ${downloadLink.href}`);
            } else if (data.status === 'error') {
                statusMessage.textContent = `❌ Error en la descarga: ${data.message}`; // Mensaje de error
                progressBar.style.width = '0%';
                downloadButton.disabled = false;
                downloadLink.style.display = 'none';
                currentDownloadSessionId = null;
                console.error('Error de descarga:', data.message);
            }
        } else {
            console.log(`Mensaje de progreso para otra sesión. Actual: ${currentDownloadSessionId}, Recibido: ${data.sessionId}`);
        }
    });
}

// --- Función para iniciar la descarga ---
downloadButton.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
        statusMessage.textContent = 'Por favor, introduce una URL válida.';
        urlInput.focus();
        return;
    }

    let selectedFormat = 'mp4';
    for (const radio of formatOptions) {
        if (radio.checked) {
            selectedFormat = radio.value;
            break;
        }
    }

    downloadButton.disabled = true; 
    progressBar.style.width = '0%';
    statusMessage.textContent = 'Preparando descarga...';
    downloadLink.style.display = 'none'; 

    currentDownloadSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 8); 
    console.log(`Iniciando descarga con SessionID: ${currentDownloadSessionId}`);

    // Unir el socket a una sala específica con el sessionId
    socket.emit('joinSession', currentDownloadSessionId);

    try {
        const response = await fetch(`${BACKEND_URL}/download-start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url, format: selectedFormat, sessionId: currentDownloadSessionId }),
        });

        const data = await response.json();
        if (data.status === 'success') {
            statusMessage.textContent = data.message;
            console.log('Solicitud al backend enviada con éxito:', data);
        } else {
            statusMessage.textContent = `❌ Error al iniciar: ${data.message}`;
            downloadButton.disabled = false;
            console.error('Error al iniciar solicitud al backend:', data);
        }
    } catch (error) {
        console.error('Error al comunicarse con el backend (fetch):', error);
        statusMessage.textContent = 'No se pudo conectar al servidor local. Asegúrate de que esté corriendo.';
        downloadButton.disabled = false;
    }
});

// --- Event listener para re-habilitar el botón si el enlace cambia o el formato cambia ---
urlInput.addEventListener('input', () => {
    downloadButton.disabled = false;
    statusMessage.textContent = 'Esperando enlace...';
    progressBar.style.width = '0%';
    downloadLink.style.display = 'none';
});

for (const radio of formatOptions) {
    radio.addEventListener('change', () => {
        downloadButton.disabled = false;
        statusMessage.textContent = 'Esperando enlace...';
        progressBar.style.width = '0%';
        downloadLink.style.display = 'none';
    });
}

// --- Inicialización al cargar la página ---
window.onload = function() {
    console.log("Aplicación frontend cargada. Inicializando Socket.IO...");
    initWebSocket();
};
