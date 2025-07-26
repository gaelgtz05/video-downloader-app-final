// No necesitamos la URL del backend, usaremos rutas relativas.

// --- Elementos del DOM (Interfaz de usuario) ---
const urlInput = document.getElementById('urlInput');
const downloadButton = document.getElementById('downloadButton');
const statusMessage = document.getElementById('statusMessage');
const formatOptions = document.getElementsByName('format');
// Ya no necesitamos la barra de progreso ni el enlace de descarga separado
// Puedes eliminarlos de tu HTML si quieres, o simplemente los ignoramos.

// --- Función para iniciar la descarga ---
downloadButton.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url || !url.includes('youtube.com')) { // Validación simple
        statusMessage.textContent = '❌ Por favor, introduce una URL de YouTube válida.';
        urlInput.focus();
        return;
    }

    // Obtenemos el formato seleccionado (mp4 o mp3)
    let selectedFormat = 'mp4';
    for (const radio of formatOptions) {
        if (radio.checked) {
            selectedFormat = radio.value;
            break;
        }
    }

    // Actualizamos la UI para indicar que algo está pasando
    statusMessage.textContent = 'Iniciando descarga, por favor espera...';
    downloadButton.disabled = true;

    // --- LA NUEVA LÓGICA ---
    // 1. Construimos la URL para llamar a nuestro nuevo backend.
    // Ej: /download?url=https://youtube.com/watch?v=...&format=mp4
    const downloadUrl = `/download?url=${encodeURIComponent(url)}&format=${selectedFormat}`;

    // 2. Redirigimos el navegador a esa URL.
    // El backend responderá con el archivo y el navegador lo descargará automáticamente.
    window.location.href = downloadUrl;

    // 3. Después de unos segundos, reactivamos el botón para permitir otra descarga.
    // No podemos saber exactamente cuándo termina la descarga, pero esto es suficiente.
    setTimeout(() => {
        statusMessage.textContent = 'Listo para otra descarga.';
        downloadButton.disabled = false;
    }, 4000); // 4 segundos
});

// --- Inicialización al cargar la página ---
window.onload = function() {
    statusMessage.textContent = 'Servicio listo. Pega un enlace de YouTube.';
    downloadButton.disabled = false;
};
