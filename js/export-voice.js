// ═══════════════════════════════════════════
// DCANT — Export : enregistrement vocal
// MediaRecorder + Whisper API, fallback Web Speech
// ═══════════════════════════════════════════

const ExportVoice = (() => {

  let _mediaRecorder = null;
  let _audioChunks = [];
  let _recognition = null;
  let _isRecording = false;
  let _transcTimer = null;

  function _showTranscSpinner() {
    const wrap = g('exportInstrInput')?.closest('.wiz-chat-input-wrap');
    if (!wrap) return;
    wrap.style.position = 'relative';
    let ov = g('exportTranscSpinner');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'exportTranscSpinner';
      ov.className = 'transc-spinner-overlay';
      wrap.appendChild(ov);
    }
    let sec = 0;
    ov.innerHTML = '<span class="transc-spinner-dot"></span> Transcription en cours… <span class="transc-spinner-time">0s</span>';
    ov.style.display = '';
    _transcTimer = setInterval(() => {
      sec++;
      const t = ov.querySelector('.transc-spinner-time');
      if (t) t.textContent = sec + 's';
    }, 1000);
  }

  function _hideTranscSpinner() {
    if (_transcTimer) { clearInterval(_transcTimer); _transcTimer = null; }
    const ov = g('exportTranscSpinner');
    if (ov) ov.style.display = 'none';
  }

  function isRecording() { return _isRecording; }

  function _setUI(recording) {
    _isRecording = recording;
    const btn = g('exportMicBtn');
    if (!btn) return;
    if (recording) {
      btn.classList.add('recording');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
      let ind = g('exportMicRecIndicator');
      if (!ind) {
        ind = document.createElement('div');
        ind.id = 'exportMicRecIndicator';
        ind.className = 'mic-rec-indicator';
        ind.innerHTML = '<span class="mic-rec-dot"></span> Parlez, ça enregistre…';
        const bar = btn.closest('.wiz-chat-bar');
        if (bar) bar.parentNode.insertBefore(ind, bar);
      }
      ind.style.display = '';
    } else {
      btn.classList.remove('recording');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
      const ind = g('exportMicRecIndicator');
      if (ind) ind.style.display = 'none';
    }
  }

  async function start() {
    if (navigator.mediaDevices && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/mp4';
        _mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        _audioChunks = [];

        _mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) _audioChunks.push(e.data);
        };

        _mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(_audioChunks, { type: mime });
          _audioChunks = [];
          _setUI(false);
          _showTranscSpinner();

          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            try {
              const resp = await fetch('/api/whisper', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ audio: base64, mime })
              });
              const data = await resp.json();
              if (!resp.ok) throw new Error(data.error || 'Erreur Whisper');
              const input = g('exportInstrInput');
              if (input && data.text) {
                const existing = input.value.trimEnd();
                input.value = existing ? existing + ' ' + data.text : data.text;
              }
            } catch (err) {
              console.error('Whisper error:', err);
              toast('Erreur de transcription. Réessayez.');
            } finally {
              _hideTranscSpinner();
            }
          };
          reader.readAsDataURL(blob);
        };

        _mediaRecorder.start();
        _setUI(true);
        return;
      } catch (err) {
        console.warn('MediaRecorder fallback to Web Speech:', err);
      }
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast('Dictée non supportée sur ce navigateur. Tapez vos instructions.');
      return;
    }

    _recognition = new SpeechRecognition();
    _recognition.lang = 'fr-FR';
    _recognition.continuous = true;
    _recognition.interimResults = true;
    const existingText = (g('exportInstrInput')?.value || '').trimEnd();

    _recognition.onstart = () => _setUI(true);

    _recognition.onresult = (e) => {
      let interim = '', final = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      const sep = existingText ? ' ' : '';
      g('exportInstrInput').value = existingText + sep + final + interim;
    };

    _recognition.onend = () => {
      _setUI(false);
      _recognition = null;
    };

    _recognition.onerror = (ev) => {
      if (ev.error !== 'no-speech') toast('Erreur de dictée. Réessayez.');
      stop();
    };

    _recognition.start();
  }

  function stop() {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
      _mediaRecorder.stop();
      _mediaRecorder = null;
      return;
    }
    if (_recognition) {
      try { _recognition.stop(); } catch (e) {}
    } else {
      _setUI(false);
    }
  }

  return { start, stop, isRecording };

})();
