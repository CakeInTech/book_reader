const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
  // Accept a single object matching { text, voice, rate }
  speakText: ({ text, voice, rate }) => ipcRenderer.invoke('speak-text', { text, voice, rate }),
    stopSpeech: () => ipcRenderer.invoke('stop-speech'),
    pauseSpeech: () => ipcRenderer.invoke('pause-speech'),
    resumeSpeech: () => ipcRenderer.invoke('resume-speech'),
    getVoices: () => ipcRenderer.invoke('get-voices'),
  getVoicesRaw: () => ipcRenderer.invoke('get-voices-raw'),
  });
} catch (e) {
  // no-op
}
