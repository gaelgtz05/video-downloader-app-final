const urlInput = document.getElementById('urlInput');
const downloadButton = document.getElementById('downloadButton');
const statusMessage = document.getElementById('statusMessage');
const formatOptions = document.getElementsByName('format');

downloadButton.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url || !url.includes('youtube.com')) {
        statusMessage.textContent = '❌ Por favor, introduce una URL de YouTube válida.';
        return;
    }

    let selectedFormat = 'mp4';
    for (const radio of formatOptions) {
        if (radio.checked) {
            selectedFormat = radio.value;
            break;
        }
    }

    statusMessage.textContent = 'Iniciando descarga...';
    downloadButton.disabled = true;

    const downloadUrl = `/download?url=${encodeURIComponent(url)}&format=${selectedFormat}`;
    window.location.href = downloadUrl;

    setTimeout(() => {
        statusMessage.textContent = 'Listo para otra descarga.';
        downloadButton.disabled = false;
    }, 4000);
});

window.onload = () => {
    statusMessage.textContent = 'Servicio listo.';
};
